# Jak přidat banku

Profil je **data, ne kód** — popisuje, kde ve výpisu leží datum, částka
a protistrana. Nová banka znamená přidat tři soubory, ne čekat na novou
verzi aplikace.

Pull request může poslat kdokoliv. Sloučit ho může jen správce repozitáře,
protože profil rozhoduje o tom, jak se čtou cizí peníze.

## Co poslat

Pro banku s identifikátorem `<id>` (malá písmena, pomlčky — třeba `fio-csv`):

| soubor | co to je |
|---|---|
| `profiles/<id>.json` | samotný profil |
| `fixtures/<id>.<přípona>` | **anonymizovaný** vzorek výpisu |
| `expected/<id>.json` | co má z toho vzorku vyjít |

Pak spusť `node tools/build-index.mjs` a commitni i změny ve složce `docs/` —
to je to, co si stahuje aplikace.

## Daňové profily jsou výjimka

Do složky `tax/` pull requesty nepřijímáme. Píše je jen správce repozitáře.

Není to nedůvěra. Špatný bankovní profil přečte výpis viditelně blbě a člověk
si toho všimne při prvním importu. **Špatná sazba ve smlouvě o zamezení
dvojího zdanění se promítne do přiznání a nevšimne si toho nikdo** — až
případně finanční úřad, a to už je pozdě.

Když víš o chybě v daňových pravidlech nebo máš čerstvě vyhlášený jednotný
kurz, založ issue s odkazem na zdroj. Opraví se to tam.

Ročníky se nikdy nemažou. Přiznání se podává zpětně a opravné ještě později,
takže profil za rok 2024 musí být k mání i za pět let.

## Vzorek musí být anonymizovaný

Do veřejného repozitáře nepatří skutečný výpis. Vezmi svůj, **přepiš v něm
jména, čísla účtů a částky** a nech jen tvar souboru. Kontrola v CI hlásí
e-mailové adresy a čísla, která projdou testem platební karty, ale spolehnout
se na ni nedá — odpovědnost je na tobě.

Vzorku stačí pár řádků. Ať v něm ale zůstane všechno, co je na tom formátu
ošidné: záporné i kladné částky, platba v cizí měně, řádek bez protistrany,
preambule nad hlavičkou, nezaúčtovaný pohyb.

## Na co si dát pozor

Tyhle věci nespadnou — jen tiše přečtou špatné číslo, a to je u peněz
nejhorší možný výsledek:

- **Oddělovač tisíců.** `1.029` je v německém zápisu tisíc dvacet devět,
  ne jedna celá nula dva devět. Vyplň `number.grouping` a `number.decimal`.
- **Kódování.** Některé banky exportují UTF-16. Aplikace to pozná podle
  značky na začátku souboru, ale `encoding` v profilu uveď.
- **Dvouciferný rok.** `dd.MM.yy` se čte jako 20yy.
- **Směr.** Když banka nedává znaménko u částky, popiš `direction`.
  Zápornou částku nikdy nedělej z kladné ručně v šabloně.
- **Prázdný protiúčet.** Šablona `{číslo}/{kód}` umí u karetních plateb
  vyrobit `/0`. Vypadá to jako protiúčet a appka se podle toho začne učit.
  Odstraň to transformací `replace`.
- **Identifikátor od banky.** Do `externalId` dávej jen to, co je opravdu
  jedinečné a stálé. Sdílená reference slije různé platby do jedné.

## Jak vyrobit `expected/<id>.json`

Tvar je jednoduchý — z každého pohybu jen to, co rozhoduje o penězích:

```json
{
  "profile": "fio-csv",
  "rows": [
    {
      "date": "2026-08-29",
      "amount": -12652,
      "currency": "CZK",
      "counterparty": "COFFEE SHOP",
      "counterpartyAccount": null,
      "variableSymbol": null,
      "message": null,
      "note": null,
      "bankCategory": null,
      "statementAccount": "1234567890",
      "externalId": null
    }
  ]
}
```

`amount` je **v haléřích** (nebo v centech dané měny) a záporné číslo znamená
peníze pryč z účtu. `date` je `RRRR-MM-DD`.

Nemusíš ho psát ručně — když v pull requestu tenhle soubor chybí, dopíše se
při kontrole proti skutečnému parseru a dostaneš ho do komentáře. Ale projdi
si ho očima: **je to jediné místo, kde se pozná, že profil čte správně.**

## Co se s pull requestem stane

1. **CI v tomhle repozitáři** (`node tools/validate.mjs`) zkontroluje tvar
   profilu, přeloží výrazy, ověří, že se sloupce, na které se profil odkazuje,
   ve vzorku opravdu vyskytují, a projde vzorek na osobní údaje.

   Tahle kontrola **nespustí skutečný parser** — ten je v neveřejném
   repozitáři aplikace. Projít ji tedy neznamená, že profil čte správně.

2. **Správce spustí profil proti opravdovému parseru** a porovná s tvým
   `expected`. Teprve tohle je skutečné ověření. Výsledek uvidíš v PR.

3. Po sloučení se profil objeví v katalogu a aplikace si ho stáhne.

## Kontrola u sebe

```bash
node tools/build-index.mjs
node tools/validate.mjs
```
