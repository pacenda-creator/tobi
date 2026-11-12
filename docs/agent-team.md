# Multi-agentní tým TOBi Prototype

Aktuální checkout obsahuje kompletní dodaný export v `agents/originals/` a adaptované běhové definice v `agents/roles/`. Mapování a požadovaná nastavení eviduje `agents/manifest.json`. Tento dokument popisuje tým a ověření importu; není konfigurace agentů.

## Původní stav — historická auditní rekapitulace

Dřívější verze tohoto dokumentu uváděla, že původní `AGENTS.md` a agentní definice nebyly v tehdejším checkoutu dostupné a jejich úplnost ani aktivaci nebylo možné ověřit. To zachycuje tehdejší omezení podkladů, nikoli současný stav po importu. Následující tabulka zachovává historický popis kompetencí a důvody jejich pozdějšího oddělení.

| Agent | Primární kompetence | Zapojení | Směl měnit | Schvalovací pravomoc | Zjištěný překryv nebo mezera |
| --- | --- | --- | --- | --- | --- |
| `tobi_architect` | Architektura, bezpečnost, LLM/RAG/data, modularita, infrastruktura a technický dluh | Před významnou architektonickou, datovou, LLM/RAG nebo bezpečnostní změnou | Standardně pouze analyzoval; implementace jen na výslovné zadání | Významná architektura po schválení Product Ownerem | Vlastnil také testovací návrhy a veškerou architektonickou dokumentaci; nebyla oddělena QA a redakční odpovědnost. |
| `tobi_ux` | Produktové, konverzační a vizuální UX, přístupnost a responzivita | Před a po zákaznické UI/flow/copy změně | Návrh a review; aplikační kód pouze na explicitní delegaci | Odborná UX review, nikoli release approval | Hranice vůči architektuře a finálnímu release GO nebyla explicitní. |
| `tobi_developer` | Produkční kód, frontend/backend, LLM integrace, unit/integration testy a debugging | Po dopadové analýze a případném Architecture/UX handoffu | Kód, testy a technickou dokumentaci v rozsahu zadání | Žádné samostatné release GO | Chyběla nezávislá QA brána, explicitní zákaz self-approval a samostatné potvrzení dokumentace. |

Dřívější audit také zaznamenal chybějící CI workflow, staging release gate a verzovaný release proces; `.openai/hosting.json` tehdy popisoval D1 binding a `vercel.json` build parametry. Jde o historické poznámky, nikoli ověření současné infrastruktury nebo oprávnění k nasazení.

## Současné definice a loader

Kořenem je toto repository. Historická cesta `tobi-prototype/` není jeho aplikační root. Stručný router `.hermes.md` odkazuje na `agents/README.md`, `agents/workflow.md` a `agents/manifest.json`. Pro běh se načítá celý obsah adaptované role a jejích závislostí; koordinátor předává explicitní kontext: zadání, kořen aktuálního checkoutu, příslušné instrukce, podklady, omezení a kandidátní SHA, pokud již existuje.

Umístění podle manifestu:

| Role | Adaptované běhové instrukce | Původní TOML v dodaném exportu |
| --- | --- | --- |
| `tobi_ux` | `agents/roles/tobi_ux.md` | `agents/originals/.codex/agents/tobi-ux.toml` |
| `tobi_architect` | `agents/roles/tobi_architect.md` | `agents/originals/.codex/agents/tobi_architect.toml` |
| `tobi_developer` | `agents/roles/tobi_developer.md` | `agents/originals/.codex/agents/tobi_developer.toml` |
| `tobi_qa` | `agents/roles/tobi_qa.md` | `agents/originals/.codex/agents/tobi_qa.toml` |
| `tobi_documentation` | `agents/roles/tobi_documentation.md` | `agents/originals/.codex/agents/tobi_documentation.toml` |

UX má podle manifestu přesně tři závislosti:

- `agents/originals/.agents/skills/tobi-chatbot-ux/SKILL.md`
- `agents/originals/.agents/skills/tobi-chatbot-ux/references/project-context.md`
- `agents/originals/.agents/skills/tobi-chatbot-ux/references/research.md`

Ostatní čtyři role mají v manifestu prázdný seznam závislostí. `agents/originals/AGENTS.md` je archivní zdroj, nikoli automaticky aktivovaná konfigurace. Přítomnost TOML ani role sama nevytváří agentní runtime, nevynucuje model a nezajišťuje oprávnění nástrojů.

Importovaný postup používá pro Developera Codex CLI s instrukcemi jeho role. Pro UX, Architekta, QA a Dokumentaci připouští samostatná volání Hermes `delegate_task`, pokud je delegace na dané instalaci ověřena; instrukce a podklady se předávají v `context`.

## Požadované nastavení a pozorované běhy

Evidence ověřená dne 2026-11-12: soukromé lokální záznamy `import-verification.json` a `developer-launcher-verification.json`. Nejsou publikovanou součástí repository; níže je shrnutí jejich pozorování, nikoli odkaz na veřejné artefakty ani záruka nastavení budoucích běhů.

| Role | Model požadovaný manifestem | Požadovaný reasoning | Pozorovaný model | Pozorovaný reasoning | Samostatný čtecí běh |
| --- | --- | --- | --- | --- | --- |
| `tobi_ux` | `gpt-6-astra` | `high` | `gpt-6.1-sol` | `UNKNOWN` | Hermes `delegate_task` |
| `tobi_architect` | Neuveden | `high` | `gpt-6.1-sol` | `UNKNOWN` | Hermes `delegate_task` |
| `tobi_developer` | Neuveden | `high` | `gpt-6.1-sol` | `high` | Codex CLI `exec --sandbox read-only` |
| `tobi_qa` | Neuveden | `high` | `gpt-6.1-sol` | `UNKNOWN` | Hermes `delegate_task` |
| `tobi_documentation` | Neuveden | `high` | `gpt-6.1-sol` | `UNKNOWN` | Hermes `delegate_task` |

Všech pět samostatných čtecích běhů použilo `gpt-6.1-sol`. UX tedy vykazuje skutečný nesoulad s požadovaným `gpt-6-astra`; čtecí smoke prošel s touto výhradou. `high` je skutečně potvrzeno jen pro Developer Codex CLI hlavičkou launcheru. U čtyř Hermes rolí není reasoning nezávisle doložen a zůstává `UNKNOWN`. Hermes běhy měly čtecí zadání a nebyla pozorována mutující volání nástrojů; to není OS sandbox. Developer použil skutečný read-only sandbox.

Čtecí smoke doložil načtení instrukcí pěti rolí a UX závislostí. Není Architecture review COMPLETE, UX review COMPLETE, Developer READY, QA GO ani Documentation READY pro release. Úplnost dodaného exportu také neznamená ověření původního zdrojového ZIPu: evidence potvrzuje dodané soubory a jejich kontrolní součty, ale uvádí, že původní ZIP identifikovaný manifestem nebyl dodán a jeho hash nebyl ověřen.

## Rozdělení kompetencí v adaptovaných rolích

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

## Release hranice a omezení pilotu

Release vyžaduje Developer READY, skutečně úspěšné povinné kontroly, dokončená potřebná Architecture/UX review, samostatné Documentation READY a finální QA GO pro tentýž přesný 40znakový immutable commit SHA. Pro staging navíc musí být ověřen cíl, mechanismus, CI identita, credentials a rollback a nesmí zůstat kritický funkční či bezpečnostní defekt. QA NO-GO nebo Documentation NOT READY staging blokují. Jakákoli změna kódu, testů, konfigurace nebo dokumentace vytváří nového kandidáta a zneplatňuje předchozí potvrzení.

Produkční nasazení vždy vyžaduje explicitní approval Product Ownera přes WhatsApp pro konkrétní otestovaný immutable SHA. Staging GO ani Documentation READY toto schválení nenahrazují. Čtecí smoke ani úspěšné lokální testy release brány nejsou schválením skutečného kandidáta.

Tento Product Ownerem schválený dokumentační pilot mění pouze `docs/agent-team.md` a je **BEZ NASAZENÍ**. Koordinátor zadává nezávislé ověření rolím Documentation a QA pro stejný finální immutable commit SHA. Lokální commit koordinátora není push ani release. Push, vytvoření PR, jakékoli nasazení ani změny aplikace či infrastruktury, včetně DB, Vercel, credentials, DNS a modelconfig, nejsou v pilotu povoleny. Tento výslovný zákaz má přednost před obecnou automatickou staging politikou v importovaném workflow.

Route `/doc` je implementovaná v `app/doc/page.tsx` s autorizací před načtením obsahu. Implementace není důkaz živé publikace ani automatické publikační pipeline; dostupnost nasazené route zde nebyla ověřena.
