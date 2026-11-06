# TOBi Studio

Interaktivní prototyp nové generace Vodafone TOBiho pro ladění vizuálního stylu, telco znalostí a konverzačních flow.

Aktuální UX obsahuje potvrzení rozpoznaného záměru, stručné odpovědi, strukturované kroky, relevantní rychlé volby, odkazy na ověřené zdroje, bezpečnostní upozornění, zpětnou vazbu a předání operátorovi s kontextem.

## Spuštění

```powershell
npm run dev
```

Bez API klíče aplikace automaticky běží v bezpečném demo režimu s lokálními odpověďmi.

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

Aktivní konfigurace je jediný verzovaný řádek v Cloudflare D1 (`DB`). Migrace je v `drizzle/0000_tobi_configurations.sql`; před nasazením musí být vytvořen D1 binding a migrace aplikována. Administrace načítá a ukládá plnou konfiguraci, zatímco veřejné API `/api/config/public` vrací pouze bezpečnou UI projekci bez promptu, modelových parametrů a secrets. Otevřené `/chat` instance kontrolují verzi přibližně každou sekundu a stejné zařízení navíc používá `BroadcastChannel`.

Zápis do administrace je povolen jen identitám v `TOBI_ADMIN_EMAILS` nebo `TOBI_ADMIN_IDS`. Hodnoty jsou čárkou oddělené; bez allowlistu je zápis i čtení interní konfigurace odmítnuto.

Nasazení musí běžet za důvěryhodnou platformní edge vrstvou, která odstraní klientem dodané `oai-authenticated-*` hlavičky a vloží ověřenou dvojici ID + e-mail. Aplikace vyžaduje obě hlavičky a následně kontroluje allowlist; kontrola `Origin` chrání před cross-site mutací, ale sama o sobě není autentizací.

Pro lokální vývoj bez D1 lze vědomě zapnout netrvalý fallback `TOBI_IN_MEMORY_CONFIG=true`. Lokální administrace navíc vyžaduje dlouhý `TOBI_LOCAL_ADMIN_TOKEN` a na `localhost` cookie se stejnou hodnotou:

```js
document.cookie = "tobi-local-admin-token=<náhodný-token>; Path=/; SameSite=Strict";
```

Tento fallback je pouze pro vývoj, po restartu se resetuje a v produkci se nikdy nepoužije.

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
