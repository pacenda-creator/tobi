# Multi-agentní tým TOBi Prototype

Historický popis importovaný z původního workspace. Původní AGENTS.md a agentní definice jsou v tomto checkoutu nedostupné; jejich obsah ani aktivaci nelze ověřit. Tento dokument není konfigurace agentů.

## Původní stav

| Agent | Primární kompetence | Zapojení | Směl měnit | Schvalovací pravomoc | Zjištěný překryv nebo mezera |
| --- | --- | --- | --- | --- | --- |
| `tobi_architect` | Architektura, bezpečnost, LLM/RAG/data, modularita, infrastruktura a technický dluh | Před významnou architektonickou, datovou, LLM/RAG nebo bezpečnostní změnou | Standardně pouze analyzoval; implementace jen na výslovné zadání | Významná architektura po schválení Product Ownerem | Vlastnil také testovací návrhy a veškerou architektonickou dokumentaci; nebyla oddělena QA a redakční odpovědnost. |
| `tobi_ux` | Produktové, konverzační a vizuální UX, přístupnost a responzivita | Před a po zákaznické UI/flow/copy změně | Návrh a review; aplikační kód pouze na explicitní delegaci | Odborná UX review, nikoli release approval | Hranice vůči architektuře a finálnímu release GO nebyla explicitní. |
| `tobi_developer` | Produkční kód, frontend/backend, LLM integrace, unit/integration testy a debugging | Po dopadové analýze a případném Architecture/UX handoffu | Kód, testy a technickou dokumentaci v rozsahu zadání | Žádné samostatné release GO | Chyběla nezávislá QA brána, explicitní zákaz self-approval a samostatné potvrzení dokumentace. |

Historické tvrzení o úplnosti agentních definic nelze v tomto checkoutu ověřit. V repository nebyl CI workflow, staging release gate ani verzovaný release proces. Konfigurace `.openai/hosting.json` pouze deklarovala D1 binding a `vercel.json` build parametry; ani jedna nepopisuje staging deployment.

## Cílové kompetence

| Agent | Vlastní | Nevlastní | Výstup pro release |
| --- | --- | --- | --- |
| `tobi_architect` | Architekturu, bezpečnost, NFR, API/integration kontrakty, zásadní technologie a obsah ADR | Rutinní implementaci, finální QA, redakční údržbu všech docs | Povinná Architecture review COMPLETE/NOT REQUIRED pro konkrétní SHA. |
| `tobi_ux` | Zákaznický zážitek, konverzační a vizuální návrh, navigaci, přístupnost a responzivitu | Technickou architekturu, bezpečnostní approval a staging GO | Povinná UX review COMPLETE/NOT REQUIRED pro konkrétní SHA. |
| `tobi_developer` | Produkční kód, unit/integration testy, opravy a implementační handoff | Nezávislé QA GO a Documentation READY | Developer READY, seznam změn a skutečné výsledky kontrol pro konkrétní SHA. |
| `tobi_qa` | Release test strategy, regresní/E2E/LLM/security ověření, severity a staging veto | Opravy produkčního kódu, architektonické rozhodnutí a produkční approval | Finální staging GO/NO-GO pro konkrétní SHA. |
| `tobi_documentation` | Technickou/funkční dokumentaci, konzistenci ADR/API/config/operations a release doc readiness | QA GO, architektonickou autoritu a produkční kód bez samostatné delegace | Documentation READY/NOT READY pro konkrétní SHA. |

## Vyřešené konflikty

- Architect schvaluje technickou podstatu ADR; Documentation Specialist ji udržuje a publikuje.
- Developer píše unit/integration testy a podklady ke změně; QA nezávisle určuje release pokrytí a výsledek.
- UX potvrzuje soulad zákaznického chování; QA kombinuje toto potvrzení s ostatními důkazy do finálního staging rozhodnutí.
- Documentation READY a QA GO jsou oddělené, povinné a vázané na stejný immutable commit.
- Produkční approval je samostatný akt Product Ownera a nikdy se nepřebírá ze staging manifestu.
- Po dvou neúspěšných opravách stejného defektu se cyklus zastaví a eskaluje s důkazy a doporučením.

## Nativní mechanismus a omezení

Původní nadřazené agentní soubory nejsou dostupné. Tabulky výše jsou historický popis a návrh procesu, nikoli důkaz aktivní konfigurace nebo automatické pipeline.

Route `/doc` je implementovaná v `app/doc/page.tsx` s autorizací před načtením obsahu. Implementace není důkaz živé publikace ani automatické publikační pipeline; dostupnost nasazené route zde nebyla ověřena.
