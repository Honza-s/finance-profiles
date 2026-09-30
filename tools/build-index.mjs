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
