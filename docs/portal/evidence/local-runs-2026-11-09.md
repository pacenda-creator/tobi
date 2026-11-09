# Lokální ověření srovnání tarifů 2026-11-09

Výsledky vznikly nad necommitnutým pracovním stromem nad HEAD `0473d18fee5cc6929e5b53104697d551f1d9415a`. Jde o auditní evidenci kandidáta pro staging, nikoli o commit-bound CI důkaz.

## RUN-20261109-CHAT

- příkaz: `npm run test:chat-contract`
- prostředí: lokální Node.js test runner
- výsledek: PASS, 117 testů prošlo, 0 selhání
- pokrytí tarifů: katalog a sedmidenní čerstvost, preference, carousel jako přímé srovnání 1–3 tarifů bez CTA Porovnat, změna požadavků, zpětná kompatibilita starého explicitně povoleného přechodu, neexistující ID, nepovolený přechod a zastaralý katalog

## RUN-20261109-TARIFF-E2E

- příkaz: `npm run test:tariff-e2e`
- prostředí: lokální Playwright, headless Microsoft Edge, reduced motion
- výsledek: PASS, 8 testů prošlo, 0 selhání
- viewporty: 320 × 568, 390 × 844, 480 × 800, 420 × 560 a 1440 × 900
- ověřeno: navigace před rolováním komponentou, průchod všemi kartami tlačítky i klávesnicí, focus aktivního detailu, composer, nulový horizontální overflow, absence CTA Porovnat a transparentní nulová shoda

## Statické kontroly a build

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS

## RUN-20261109-DOCS

- příkazy: `npm run docs:validate`, `npm run test:docs`
- prostředí: lokální Node.js test runner
- výsledek: PASS, validováno 17 funkcí, 48 regresí, 5 předchozích doložených běhů a 3 diagramy; 4/4 testy portálu prošly

Screenshoty z E2E běhu jsou v `artifacts/tariff-comparison/`. Ceny a parametry pocházejí z verzovaného katalogu zkontrolovaného 2026-11-08; runtime je považuje za aktuální nejvýše sedm dní.
