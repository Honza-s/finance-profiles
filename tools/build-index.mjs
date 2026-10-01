// Vyrobí to, co si stahuje aplikace: docs/profiles/index.json a kopie profilů.
//
// Publikuje se složka docs/, protože z ní umí GitHub Pages servírovat bez
// dalšího nastavení. Kopie v ní jsou generované — zdroj je vždycky profiles/.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const OUT = "docs/profiles";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const profiles = [];

for (const file of readdirSync("profiles").filter((f) => f.endsWith(".json")).sort()) {
  const text = readFileSync(`profiles/${file}`, "utf8");
  const profile = JSON.parse(text);
  const cat = profile.catalogue ?? {};

  writeFileSync(`${OUT}/${file}`, text, "utf8");

  profiles.push({
    id: profile.id,
    bank: profile.bank,
    label: profile.label,
    country: cat.country ?? null,
    format: profile.format,
    kind: profile.kind ?? "statement",
    version: profile.version,
    keywords: cat.keywords ?? [],
    howTo: cat.howTo ?? null,
    file: basename(file),
    bytes: Buffer.byteLength(text, "utf8"),
    // Otisk se ověřuje po stažení. Profil rozhoduje, jak se čtou částky,
    // takže se aplikace nespoléhá jen na to, že soubor přišel ze správné adresy.
    sha256: createHash("sha256").update(text, "utf8").digest("hex")
  });
}

const index = {
  schema: 1,
  updated: new Date().toISOString().slice(0, 10),
  count: profiles.length,
  profiles
};

writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(`Hotovo: ${profiles.length} profilů do ${OUT}/`);

// --- daňové profily ---------------------------------------------------------
//
// Ročníky se nikdy nemažou. Přiznání se podává zpětně a opravné ještě
// později, takže profil za 2024 musí být k mání i za pět let. Proto se
// vedle sebe publikují všechny, ne jen „aktuální".

const TAX_OUT = "docs/tax";
rmSync(TAX_OUT, { recursive: true, force: true });
mkdirSync(TAX_OUT, { recursive: true });

const taxProfiles = [];

for (const file of readdirSync("tax").filter((f) => f.endsWith(".json")).sort()) {
  const text = readFileSync(`tax/${file}`, "utf8");
  const profile = JSON.parse(text);

  writeFileSync(`${TAX_OUT}/${file}`, text, "utf8");

  taxProfiles.push({
    id: profile.id,
    country: profile.country,
    label: profile.label,
    version: profile.version ?? 1,
    validFrom: profile.validFrom,
    validTo: profile.validTo ?? null,
    file,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: createHash("sha256").update(text, "utf8").digest("hex")
  });
}

writeFileSync(
  `${TAX_OUT}/index.json`,
  JSON.stringify(
    { schema: 1, updated: index.updated, count: taxProfiles.length, profiles: taxProfiles },
    null,
    2
  ) + "\n",
  "utf8"
);
console.log(`Hotovo: ${taxProfiles.length} daňových profilů do ${TAX_OUT}/`);
