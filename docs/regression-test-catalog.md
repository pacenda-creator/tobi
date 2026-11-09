# Katalog regresních testů

Vlastník katalogu: `tobi_qa` ve spolupráci s `tobi_documentation`. Developer udržuje testy související s implementací; QA rozhoduje, zda release pokrytí odpovídá riziku.

## Automatizovaný baseline

| Oblast | Aktuální testy | Povinný příkaz |
| --- | --- | --- |
| Chat API contract a povolené UI bloky | `scripts/chat-contract-v1.test.mjs` | `npm run test:chat-contract` |
| Konverzační orchestrace a navazující flow | `conversation-orchestrator`, `demo-scenario-flow`, `smart-demo-conversation` | `npm run test:chat-contract` |
| RAG response plan a zdroje | `rag-response-plan.test.mjs` a související contract testy | `npm run test:chat-contract` |
| Router diagnostika | `router-diagnostics.test.mjs` | `npm run test:chat-contract` |
| Mock operator/handoff | `mock-operator.test.mjs` | `npm run test:chat-contract` |
| Centrální konfigurace a synchronizace | `tobi-config.test.mjs`, `tobi-config-sync.test.mjs` | `npm run test:chat-contract` |
| Carousel layout kontrakt | `carousel-layout.test.mjs` | `npm run test:chat-contract` |
| Tarifní katalog, preference, stavové flow a validovaný blok | `tariff-comparison.test.mjs` | `npm run test:chat-contract` |
| Jednokartový tarifní carousel jako přímé srovnání na 320/390/480 px, kompaktním a desktopovém viewportu | `e2e/tariff-comparison.spec.ts` | `npm run test:tariff-e2e` |
| Staging release gate | `staging-release-gate.test.mjs` | `npm run test:release-gate` |
| Statická kvalita | ESLint a TypeScript | `npm run lint`, `npm run typecheck` |
| Sestavení releasovatelného artefaktu | Aplikační build | `npm run build` |

## Povinné rizikové scénáře

Podle dopadu změny QA doplní automatizované nebo dohledatelné manuální ověření:

- pozdrav, small talk, neznámý dotaz a dotaz mimo kompetence TOBi;
- udržení kontextu v navazujících dotazech a bezpečné přerušení/návrat;
- prompt injection, požadavek na citlivá data, ochranu system/developer instrukcí a secrets;
- diagnostické flow, retry, error a fallback/handoff;
- RAG relevanci, vazbu odpovědi na zdroje a chování bez spolehlivé odpovědi;
- pouze povolené strukturované UI komponenty a bezpečné zpracování modelového výstupu;
- responzivitu, klávesnici, focus, čitelnost, oznamování nových zpráv a chybové stavy;
- opakované běhy nedeterministických odpovědí hodnocené podle významu, faktické správnosti, bezpečnosti a stability.
- srovnání tarifů pouze z katalogu, viditelné nulové shody, neznámé ID, změnu preferencí bez ztráty kontextu a chování katalogu po sedmi dnech.

U chat-widget sizing/responsive změn je povinný realistický rich-response scénář v nejmenším podporovaném kontejneru: nejvyšší relevantní blok, dlouhá odpověď, carousel první/střední/poslední pozice, navigace a CTA, composer, keyboard, reduced motion a resize. Prázdný welcome screenshot nestačí.

## Evidence a rozhodnutí

Každý release výsledek musí uvést přesný commit SHA. Lokální auditní běh nad necommitnutým pracovním stromem musí být takto výslovně označený a nesmí se vydávat za commit-bound release evidenci. V obou případech evidence uvádí prostředí, příkaz nebo kroky, čas, skutečný výsledek a umístění logu/reportu. Netestovaný scénář je NOT RUN nebo BLOCKED, nikdy PASS.

Kritický bezpečnostní nebo funkční defekt znamená QA NO-GO. Nižší severity se posuzuje podle dopadu, workaroundu a regresního rizika; případná výjimka musí být explicitní, dohledatelná a nesmí obejít bezpečnostní pravidla.

Aktuální konkrétní případy a doložené výsledky jsou vedené ve verzovaných souborech `docs/portal/regression-cases.json` a `docs/portal/test-runs.json` a autorizovaným správcům se zobrazují na `/doc`. Tento soubor zůstává procesním přehledem; není paralelní kopií jednotlivých případů.
