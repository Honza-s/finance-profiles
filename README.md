# Profily výpisů pro aplikaci Finance

Aplikace [Finance](https://honza-s.github.io/finance-profiles/privacy/) umí načítat
výpisy z banky místo přepisování pohybů ručně. Jak takový výpis vypadá, není
v aplikaci zadrátované — popisuje to **datový soubor**, jeden na banku a formát.
Tenhle repozitář je jejich veřejný katalog.

Nová banka tedy znamená přidat soubor, ne čekat na novou verzi aplikace.
**Pull request může poslat kdokoliv** — viz [CONTRIBUTING.md](CONTRIBUTING.md).

## Co tu je

| složka | k čemu |
|---|---|
| `profiles/` | profily — zdroj pravdy |
| `fixtures/` | anonymizované vzorky výpisů |
| `expected/` | co má z každého vzorku vyjít |
| `docs/` | co si stahuje aplikace (generované) |
| `tools/` | sestavení katalogu a kontrola |

## Katalog

Aplikace si stahuje jediný soubor se seznamem a hledá v něm **u sebe
v telefonu**:

```
https://honza-s.github.io/finance-profiles/profiles/index.json
```

Vyhledávání schválně neběží na serveru. Dotaz „hledám Českou spořitelnu"
by prozradil, u které banky uživatel je, a to je přesně ten údaj, o kterém
aplikace slibuje, že telefon neopustí. Takhle server vidí jen to, že si
někdo stáhl seznam.

U každého profilu je v seznamu otisk `sha256`. Aplikace ho po stažení ověří —
profil rozhoduje o tom, jak se čtou částky, takže se nespoléhá jen na to,
že soubor přišel ze správné adresy.

## Podporované banky

| banka | formát | profil |
|---|---|---|
| Česká spořitelna | CSV (UTF-16) | `csas-csv` |
| Česká spořitelna | JSON | `csas-json` |
| ČSOB | CSV | `csob-csv` |
| ČSOB | PDF výpis | `csob-pdf` |
| ČSOB | avízo e-mailem | `csob-avizo` |
| DKB | CSV (Umsatzliste) | `dkb-csv` |
| Partners Banka | CSV | `partners-csv` |

U Spořitelny ber radši **JSON než CSV**: má navíc IBAN protistrany i kategorii
od banky a částka v něm nemá desetinnou čárku, takže se nedá přečíst o řád vedle.

## Kontrola u sebe

```bash
node tools/build-index.mjs
node tools/validate.mjs
```

Tahle kontrola umí přečíst jen soubory. **Skutečný parser je v neveřejném
repozitáři aplikace** a profil se proti němu spouští před sloučením pull
requestu — teprve to ověří, že profil čte správně.

## Soukromí

[Zásady ochrany soukromí aplikace](https://honza-s.github.io/finance-profiles/privacy/)
