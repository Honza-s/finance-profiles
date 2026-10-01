// Kontrola katalogu profilů. Běží v CI na každý pull request, i z forku,
// takže nesmí potřebovat žádné tajemství ani přístup do soukromého repozitáře.
//
// Skutečný parser je v aplikaci a tady k dispozici není. Tahle kontrola proto
// hlídá všechno, co jde poznat ze souborů samotných — a záměrně radši hlásí
// víc, než aby něco pustila dál. Poslední slovo má běh proti opravdovému
// parseru před sloučením, viz CONTRIBUTING.md.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";

const FORMATS = ["delimited", "fixedWidth", "xml", "textRegex", "json", "single"];
const KINDS = ["statement", "notification"];
const TRANSFORMS = [
  "trim", "upper", "lower", "collapseSpaces",
  "regexExtract", "replace", "stripNonDigits", "take"
];

const problems = [];
const notes = [];

function fail(file, message) {
  problems.push(`${file}: ${message}`);
}

// --- pomocné -----------------------------------------------------------------

/** Projde celý strom a zavolá `visit` na každý objekt. */
function walk(node, visit, path = "") {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, visit, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    visit(node, path);
    for (const [key, value] of Object.entries(node)) {
      walk(value, visit, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Přeloží javovský výraz na javascriptový, aby se dal aspoň zkusit přeložit.
 *
 * Java umí vložené přepínače `(?i)`, JavaScript je má jako příznaky vedle
 * výrazu. Pár věcí Java umí a JavaScript ne (atomické skupiny, chamtivé
 * opakovače navíc) — u těch se kontrola radši vzdá, než aby hlásila chybu,
 * která žádná není. Skutečný překlad výrazu proběhne až v aplikaci.
 */
function toJsRegex(pattern) {
  if (/\(\?>/.test(pattern) || /[*+?}][+]/.test(pattern) || /\(\?[a-z]*x/.test(pattern)) {
    return null; // javovská konstrukce bez protějšku, nedá se poctivě ověřit
  }
  let flags = "";
  const body = pattern.replace(/\(\?([imsu]+)\)/g, (_, found) => {
    for (const c of found) {
      if ("ims".includes(c) && !flags.includes(c)) flags += c;
    }
    return "";
  });
  return new RegExp(body, flags);
}

/**
 * Výrazy, které se umí zakousnout. Vnořený opakovač nad opakovačem
 * ("(a+)+") umí na nešťastném vstupu běžet prakticky navždy a profil se
 * stahuje z internetu — nechceme, aby zamrzla aplikace kvůli cizímu souboru.
 */
function looksExplosive(pattern) {
  return /\([^()]*[+*][^()]*\)\s*[+*]/.test(pattern) ||
    /\(\?[:=!][^()]*[+*][^()]*\)\s*[+*]/.test(pattern);
}

/** Luhnův test — chytí skutečné číslo platební karty ve vzorku. */
function luhnOk(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// --- profily -----------------------------------------------------------------

const profileFiles = readdirSync("profiles").filter((f) => f.endsWith(".json")).sort();
if (profileFiles.length === 0) fail("profiles/", "složka je prázdná");

const seen = new Set();

for (const file of profileFiles) {
  const where = `profiles/${file}`;
  const id = basename(file, ".json");
  let profile;

  try {
    profile = JSON.parse(readFileSync(where, "utf8"));
  } catch (e) {
    fail(where, `není platný JSON (${e.message})`);
    continue;
  }

  if (profile.id !== id) fail(where, `"id" je "${profile.id}", ale soubor se jmenuje "${id}"`);
  if (seen.has(profile.id)) fail(where, `"id" se opakuje`);
  seen.add(profile.id);

  for (const key of ["bank", "label", "format"]) {
    if (!profile[key]) fail(where, `chybí "${key}"`);
  }
  if (!Number.isInteger(profile.version) || profile.version < 1) {
    fail(where, `"version" musí být celé číslo od 1 výš (aplikace podle něj pozná novější profil)`);
  }
  if (profile.format && !FORMATS.includes(profile.format)) {
    fail(where, `neznámý "format": ${profile.format}`);
  }
  if (profile.kind && !KINDS.includes(profile.kind)) {
    fail(where, `neznámý "kind": ${profile.kind}`);
  }
  // Sekce popisující čtení souboru musí sedět na formát, jinak profil
  // spadne až u uživatele na "Profil nemá sekci ...".
  const section = { delimited: "delimited", fixedWidth: "fixedWidth", xml: "xml", textRegex: "textRegex", json: "json" }[profile.format];
  if (section && !profile[section]) fail(where, `"format" je "${profile.format}", ale chybí sekce "${section}"`);

  if (!profile.row) {
    fail(where, `chybí "row"`);
  } else {
    if (!profile.row.date) fail(where, `"row" nemá "date" — bez data se pohyb nedá zařadit`);
    if (!profile.row.amount) fail(where, `"row" nemá "amount"`);
  }

  const cat = profile.catalogue;
  if (!cat) {
    fail(where, `chybí blok "catalogue" (země, klíčová slova, kde export najít)`);
  } else {
    if (!/^[A-Z]{2}$/.test(cat.country || "")) fail(where, `"catalogue.country" má být kód země, třeba "CZ"`);
    if (!Array.isArray(cat.keywords) || cat.keywords.length === 0) {
      fail(where, `"catalogue.keywords" je prázdné — podle toho uživatel banku najde`);
    }
    if (!cat.howTo) fail(where, `"catalogue.howTo" neříká, kde se export v bance vezme`);
  }

  // Regulární výrazy a transformace
  walk(profile, (node, path) => {
    if (typeof node.op === "string" && !TRANSFORMS.includes(node.op)) {
      fail(where, `neznámá transformace "${node.op}" v ${path}`);
    }
    for (const key of ["pattern", "fileNamePattern", "contentPattern"]) {
      const pattern = node[key];
      if (typeof pattern !== "string") continue;
      try {
        toJsRegex(pattern);
      } catch (e) {
        fail(where, `výraz v ${path}.${key} nejde přeložit: ${e.message}`);
      }
      if (looksExplosive(pattern)) {
        fail(where, `výraz v ${path}.${key} má vnořený opakovač a umí se zakousnout`);
      }
    }
  });

  // Vzorek a očekávaný výsledek
  const fixture = readdirSync("fixtures").find((f) => basename(f, extname(f)) === id);
  if (!fixture) {
    fail(where, `chybí vzorek fixtures/${id}.* — bez něj se profil nedá ověřit`);
  }
  if (!existsSync(`expected/${id}.json`)) {
    fail(where, `chybí expected/${id}.json s tím, co má z vzorku vyjít`);
  } else {
    let expected;
    try {
      expected = JSON.parse(readFileSync(`expected/${id}.json`, "utf8"));
    } catch (e) {
      fail(`expected/${id}.json`, `není platný JSON (${e.message})`);
    }
    if (expected && (!Array.isArray(expected.rows) || expected.rows.length === 0)) {
      fail(`expected/${id}.json`, `"rows" je prázdné — co se tedy má ověřit?`);
    }
    if (expected && Array.isArray(expected.rows)) {
      for (const [i, row] of expected.rows.entries()) {
        if (typeof row.amount !== "number") {
          fail(`expected/${id}.json`, `řádek ${i + 1} nemá "amount" jako číslo v haléřích`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || "")) {
          fail(`expected/${id}.json`, `řádek ${i + 1} nemá "date" ve tvaru RRRR-MM-DD`);
        }
      }
    }
  }

  // Sloupce, na které se profil odkazuje, musí být ve vzorku. Tohle chytá
  // nejčastější chybu vůbec: překlep v názvu sloupce. Profil nespadne,
  // jen tiše nenačte protistranu nebo symbol.
  if (profile.format === "delimited" && fixture && profile.delimited) {
    const header = headerOf(`fixtures/${fixture}`, profile.delimited);
    if (header) {
      const known = new Set(header.map((h) => h.toLowerCase()));
      for (const name of Object.keys(profile.documentFields || {})) known.add(name.toLowerCase());
      walk(profile.row, (node, path) => {
        // Záložní pole (`fallback`) je tam schválně pro případ, že banka
        // sloupec přejmenuje — ve vzorku být nemusí a hlásit to jako chybu
        // by nutilo lidi ty pojistky vyhazovat.
        const report = path.includes("fallback")
          ? (msg) => notes.push(`${where}: ${msg}`)
          : (msg) => fail(where, msg);

        if (typeof node.from === "string" && !known.has(node.from.toLowerCase())) {
          report(`"${node.from}" (v row.${path}) není sloupec vzorku ani pole z documentFields`);
        }
        if (typeof node.template === "string") {
          for (const m of node.template.matchAll(/\{([^}]+)\}/g)) {
            if (!known.has(m[1].toLowerCase())) {
              report(`"${m[1]}" v šabloně row.${path} není sloupec vzorku`);
            }
          }
        }
      });
    }
  }
}

/** Přečte hlavičku ze vzorku. Zvládne i preambuli nad hlavičkou. */
function headerOf(path, spec) {
  const bytes = readFileSync(path);
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = bytes.slice(2).toString("utf16le");
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = bytes.slice(2).swap16().toString("utf16le");
  else if (bytes[0] === 0xef && bytes[1] === 0xbb) text = bytes.slice(3).toString("utf8");
  else text = bytes.toString("utf8");

  const delimiter = (spec.delimiter || ";")[0];
  const lines = text.split(/\r?\n/);
  const needles = (spec.headerMustContain || []).map((s) => s.toLowerCase());
  const index = needles.length
    ? lines.findIndex((l) => needles.every((n) => l.toLowerCase().includes(n)))
    : (spec.skipLines || 0);
  if (index < 0 || !lines[index]) return null;
  return lines[index]
    .split(delimiter)
    .map((c) => c.trim().replace(/^"|"$/g, "").trim());
}

// --- vzorky: nesmí v nich být cizí osobní údaje ------------------------------

for (const file of readdirSync("fixtures")) {
  const where = `fixtures/${file}`;
  const bytes = readFileSync(where);
  const text = (bytes[0] === 0xff && bytes[1] === 0xfe)
    ? bytes.slice(2).toString("utf16le")
    : bytes.toString("utf8");

  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)) {
    fail(where, `je v něm e-mailová adresa "${m[0]}" — vzorky musí být anonymizované`);
  }
  for (const m of text.matchAll(/\d[\d ]{11,21}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
      fail(where, `obsahuje číslo, které projde kontrolou platební karty — vzorky musí být anonymizované`);
    }
  }
  if (bytes.length > 256 * 1024) {
    notes.push(`${where}: vzorek má přes 256 kB, stačí pár řádků`);
  }
}

// --- publikovaná složka musí sedět na zdroj ----------------------------------

const indexPath = "docs/profiles/index.json";
if (!existsSync(indexPath)) {
  fail(indexPath, `chybí — spusť "node tools/build-index.mjs" a výsledek commitni`);
} else {
  const published = JSON.parse(readFileSync(indexPath, "utf8"));
  const ids = new Set(published.profiles.map((p) => p.id));
  for (const id of seen) {
    if (!ids.has(id)) fail(indexPath, `neobsahuje "${id}" — spusť "node tools/build-index.mjs"`);
  }
  for (const entry of published.profiles) {
    const copy = `docs/profiles/${entry.file}`;
    if (!existsSync(copy)) {
      fail(indexPath, `odkazuje na ${entry.file}, ale soubor tam není`);
      continue;
    }
    const source = `profiles/${entry.id}.json`;
    if (existsSync(source) && readFileSync(source, "utf8") !== readFileSync(copy, "utf8")) {
      fail(copy, `se liší od ${source} — spusť "node tools/build-index.mjs"`);
    }
  }
}


// --- daňové profily ----------------------------------------------------------
//
// Přísnější než u bank. Špatný bankovní profil přečte výpis viditelně blbě;
// špatná sazba ve smlouvě se promítne do přiznání a nikdo si toho nevšimne.

const taxFiles = existsSync("tax")
  ? readdirSync("tax").filter((f) => f.endsWith(".json")).sort()
  : [];

const taxIds = new Set();

for (const file of taxFiles) {
  const where = `tax/${file}`;
  let profile;
  try {
    profile = JSON.parse(readFileSync(where, "utf8"));
  } catch (e) {
    fail(where, `není platný JSON (${e.message})`);
    continue;
  }

  if (profile.id !== basename(file, ".json")) {
    fail(where, `"id" je "${profile.id}", ale soubor se jmenuje "${basename(file, ".json")}"`);
  }
  if (taxIds.has(profile.id)) fail(where, `"id" se opakuje`);
  taxIds.add(profile.id);

  if (!/^[A-Z]{2}$/.test(profile.country || "")) {
    fail(where, `"country" má být kód země, třeba "CZ"`);
  }
  if (!Number.isInteger(profile.validFrom)) {
    fail(where, `chybí "validFrom" — bez roku se neví, na co profil platí`);
  }
  if (profile.validTo != null && profile.validTo < profile.validFrom) {
    fail(where, `"validTo" je dřív než "validFrom"`);
  }

  // Sazby jsou podíly, ne procenta. "15" místo "0.15" by stonásobilo daň.
  const rate = (label, value) => {
    if (value == null) return;
    if (typeof value !== "number" || value < 0 || value > 1) {
      fail(where, `${label} = ${value}; sazba se píše jako podíl (0.15), ne procenta`);
    }
  };

  rate('dividends.rate', profile.dividends?.rate);
  rate('dividends.defaultForeign.maxSourceRate', profile.dividends?.defaultForeign?.maxSourceRate);
  for (const [code, treaty] of Object.entries(profile.dividends?.treaties ?? {})) {
    if (!/^[A-Z]{2}$/.test(code)) fail(where, `smlouva "${code}" nemá kód země`);
    rate(`smlouva ${code}`, treaty?.maxSourceRate);
  }
  for (const [code, value] of Object.entries(profile.annualRates ?? {})) {
    if (!/^[A-Z]{3}$/.test(code)) fail(where, `jednotný kurz "${code}" nemá kód měny`);
    if (typeof value !== "number" || value <= 0) {
      fail(where, `jednotný kurz ${code} = ${value}; čeká se korun za jednotku`);
    }
  }

  // Bez zdroje se po roce nedá dohledat, odkud to číslo je.
  if (!profile.source && !profile.dividends?.source) {
    notes.push(`${where}: chybí "source" — odkud ta pravidla jsou`);
  }
}

if (taxFiles.length > 0) {
  const taxIndex = "docs/tax/index.json";
  if (!existsSync(taxIndex)) {
    fail(taxIndex, `chybí — spusť "node tools/build-index.mjs" a výsledek commitni`);
  } else {
    const published = JSON.parse(readFileSync(taxIndex, "utf8"));
    for (const id of taxIds) {
      if (!published.profiles.some((p) => p.id === id)) {
        fail(taxIndex, `neobsahuje "${id}" — spusť "node tools/build-index.mjs"`);
      }
    }
    // Rocnik, ktery uz jednou vysel, nesmi zmizet: priznani se podava zpetne.
    for (const entry of published.profiles) {
      if (!existsSync(`tax/${entry.file}`)) {
        fail(taxIndex, `odkazuje na ${entry.file}, ale zdroj už v tax/ není`);
      }
    }
  }
}

// --- výsledek ----------------------------------------------------------------

for (const note of notes) console.log(`poznámka: ${note}`);

if (problems.length) {
  console.error(`\nKatalog neprošel, ${problems.length} problémů:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`Katalog v pořádku: ${profileFiles.length} profilů bank a ${taxFiles.length} daňových.`);
