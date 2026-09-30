## Jaká banka a jaký export

<!-- Napr.: Fio banka, export pohybu z internetoveho bankovnictvi, CSV -->

## Kontrolní seznam

- [ ] Vzorek ve `fixtures/` je **anonymizovaný** — přepsaná jména, čísla účtů i částky.
- [ ] Vzorek obsahuje i ošidné případy (záporná i kladná částka, cizí měna, prázdná protistrana).
- [ ] Spustil jsem `node tools/build-index.mjs` a commitnul i změny v `docs/`.
- [ ] Spustil jsem `node tools/validate.mjs` a prošlo to.
- [ ] Zkontroloval jsem `expected/<id>.json` očima — částky i data sedí.

## Poznámky

<!-- Cokoliv zvlastniho na tom formatu -->
