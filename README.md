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
3. Volitelně změňte `OPENAI_MODEL`.
4. Restartujte vývojový server.

Klíč se používá pouze v serverové route `app/api/chat/route.ts` a nikdy se neposílá do prohlížeče.

## Struktura

- `components/tobi-studio.tsx` — interaktivní prototyp a UI
- `app/api/chat/route.ts` — mock režim a OpenAI Responses API
- `app/api/status/route.ts` — stav napojení pro inspektor
- `lib/vodafone-knowledge.ts` — kurátorované krokové scénáře pro nejčastější situace
- `lib/vodafone-search.ts` — relevance a dohledání zdrojů napříč Centrem péče
- `data/vodafone-care-index.json` — synchronizovaný obsah veřejných článků
- `scripts/sync-vodafone-knowledge.mjs` — crawler oficiální sitemap a tvorba indexu
- `app/globals.css` — vizuální systém a animace
