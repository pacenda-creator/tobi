# TOBi Studio

Interaktivní prototyp nové generace Vodafone TOBiho pro ladění vizuálního stylu, telco znalostí a konverzačních flow.

Aktuální UX obsahuje potvrzení rozpoznaného záměru, stručné odpovědi, strukturované kroky, relevantní rychlé volby, odkazy na ověřené zdroje, bezpečnostní upozornění, zpětnou vazbu a předání operátorovi s kontextem.

## Spuštění

```powershell
npm run dev
```

Bez modelového API klíče aplikace používá demo odpovědi; konfigurace vyžaduje DB nebo explicitní lokální paměť popsanou níže.

## Znalosti z Vodafone.cz

Prototyp má lokální vyhledávací index veřejného Centra péče Vodafone. Aktuální snapshot obsahuje 887 obsahových stránek; prázdné rozcestníky a čistě video landing pages se do indexu neukládají. Pro každý dotaz se vyberou nejrelevantnější články, které se zobrazí jako ověřené zdroje a v AI režimu tvoří jediný znalostní kontext odpovědi.

Index obnovíte z oficiální sitemap příkazem:

```powershell
npm run knowledge:sync
```

Synchronizaci spouštějte při větších změnách Vodafone.cz nebo před uživatelským testováním. Vygenerovaný soubor je uložený v `data/vodafone-care-index.json`.

## Zapnutí OpenAI API

ChatGPT předplatné a OpenAI API mají oddělené účtování. Pro živé odpovědi je potřeba API účet, aktivní API billing a serverový API klíč.

1. Zkopírujte `.env.example` do `.env.local`.
2. Doplňte `OPENAI_API_KEY`.
3. Restartujte vývojový server.

Klíč se používá pouze v serverové chat route a nikdy se neposílá do prohlížeče. Model, prompt, reasoning a podporované modelové parametry se spravují v administraci a ukládají do centrální konfigurace.

## Centrální konfigurace

Aktivní konfigurace cílové Next aplikace používá PostgreSQL repository. Driver pg a testovací PGlite byly úspěšně nainstalovány z offline npm cache; lokální SQL testy vykonávají migraci, seed/read, JSON, timestamp, CAS/souběh a RLS/grants bez vzdálené DB. Interní přístup `/admin`, `/doc` a admin API je bezpečně uzamčený do implementace schválené serverem ověřené identity/session. Raw Sites hlavičky ani vývojové tokeny nepřijímáme.

Podrobnosti DB, TLS, ruční SQL migrace (zatím neaplikovaná na vzdálenou DB), oddělení preview/production, offline instalace a přesné příkazy obsahuje [provozní dokumentace Vercel/Supabase](docs/vercel-supabase.md). Primární příkazy jsou `npm run dev` (Next na 3000), `npm run build` (Next 16.3.4 webpack) a `npm start`. Build nevyžaduje DB. Pro lokální zákaznické demo bez DB je nutné explicitní `TOBI_IN_MEMORY_CONFIG=true`; v produkci se nikdy nepoužije.

## Struktura

- `components/tobi-studio.tsx` — interaktivní prototyp a UI
- `app/api/chat/v1/route.ts` — verzovaný chat, RAG a OpenAI Responses API
- `app/api/config/public/route.ts` — bezpečná veřejná projekce konfigurace
- `app/api/config/admin/route.ts` — chráněné načtení a atomické uložení konfigurace
- `app/api/status/route.ts` — stav napojení pro inspektor
- `lib/vodafone-knowledge.ts` — kurátorované krokové scénáře pro nejčastější situace
- `lib/vodafone-search.ts` — relevance a dohledání zdrojů napříč Centrem péče
- `data/vodafone-care-index.json` — synchronizovaný obsah veřejných článků
- `scripts/sync-vodafone-knowledge.mjs` — crawler oficiální sitemap a tvorba indexu
- `app/globals.css` — vizuální systém a animace

## Údržba interní dokumentace

Interní portál `/doc` je dostupný pouze uživatelům se stejným oprávněním jako `/admin`. Jeho jediným zdrojem pravdy jsou verzované soubory v `docs/portal/`; portál nepoužívá D1 ani veřejné dokumentační API.

Při změně funkcionality, kontraktu, konfigurace, testu nebo provozního postupu:

1. aktualizujte odpovídající Markdown/JSON v `docs/portal/`,
2. zachovejte odkazy na skutečné zdrojové a testovací soubory,
3. označte PASS/FAIL jen tehdy, když existuje datum, revize, příkaz a evidence skutečného běhu,
4. spusťte `npm run docs:validate` a `npm run test:docs`,
5. zkontrolujte přihlášení/non-admin/admin, hledání, filtry, kotvy a mobilní rozložení `/doc`.

Hodnoty secrets, zákaznická data, reálné konverzace a privátní URL do dokumentace nepatří.

Provenance dokumentace používá existující `sourceRevision` jako base commit v repository `https://github.com/pacenda-creator/tobi.git`. Validátor ověřuje formát SHA, existenci commit objektu, předka HEAD a přesný origin i URL `https://github.com/pacenda-creator/tobi/blob/<SHA>`. Shodné referencované soubory odkazují na base; odlišné nebo přidané soubory mají v `changedSources` SHA-256 aktuálních bajtů a portál je označuje jako změněné proti base bez odkazu na neexistující publikovaný obsah. Rozhoduje obsah vůči base, nikoli Git status; model nevyžaduje budoucí commit. Manifest ani jeho metadata nejsou vlastními hashovanými zdroji.

Původní nadřazené AGENTS.md a agentní definice nejsou dostupné. `docs/agent-team.md` je historický popis a návrh, nikoli aktivní konfigurace. Implementovaná route `/doc` sama nedokládá živou publikaci ani automatickou pipeline. Historická test evidence zůstává historická; aktuální lokální kontrolní logy jsou v ignorovaném `.sites-runtime`.
