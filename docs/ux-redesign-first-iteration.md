# TOBi UX redesign – audit a první iterace

Datum: 31. 10. 2026

## Audit existující implementace

| Oblast | Skutečný stav a soubory |
|---|---|
| Widget, hlavička, zprávy, rychlé volby a feedback | `components/tobi-studio.tsx`; jeden klientský prototyp se stavem v Reactu. |
| Zákaznický náhled | `app/chat/page.tsx`; používá stejnou komponentu v režimu `customerOnly`. |
| Mediakarty | `components/tobi/media-carousel.tsx`, data v `lib/vodafone-knowledge.ts`. |
| Úvodní scénáře | Dříve pevná mřížka z `topics.slice(0, 4)`; nyní konfigurovaný carousel v `components/tobi/capability-carousel.tsx`. |
| Internet a eSIM | Kurátorované scénáře v `lib/vodafone-knowledge.ts`; internet má mediakarty, eSIM zůstává textový postup pro další fázi. |
| Major Incident Mode | Před iterací neexistoval. Nyní datový model v `lib/tobi-config.ts`, karta v `components/tobi/incident-card.tsx` a bezpečné demo stavy v TOBi Settings. |
| Handover / Genesys | Žádná Genesys integrace ani backend handoveru. Existují pouze runtime typy a pravdivý informační popover; skutečné přepojení nebylo implementováno. |
| Přihlášení | `app/chatgpt-auth.ts` řeší hostitelské ChatGPT přihlášení, nikoli Vodafone zákaznickou autentizaci. Chat žádné skutečné oprávnění zákazníka nepoužívá. |
| Session a historie | Stav pouze v paměti komponenty. Zavření widgetu jej zachová, reload stránky nikoli. Nový chat vytváří nový lokální kontext. |
| AI, prompt a model | `app/api/chat/route.ts`; Responses API, model z `OPENAI_MODEL`, prompt je inline, posledních 12 zpráv. Bez tool callingu, verzování promptu a eval vrstvy. V této iteraci beze změny. |
| RAG | `lib/vodafone-search.ts` a lokální index veřejných stránek Vodafone; zdroje vrací API route. |
| Design tokeny | `app/globals.css`; doplněná typografická a radius škála. Rozptýlené historické utility zůstávají kandidátem na postupnou migraci. |

## Implementované obrazovky

### Standardní úvod

- Čtyři konfigurované příklady: PUK, internet, Vodafone TV, vyúčtování.
- Jedna karta s náhledem další pod 520 px šířky widgetu, dvě karty nad hranicí.
- Bez autoplay a číselného vizuálního statusu; dvě šipky, čtyři tečky a stav pro čtečku.
- Karta spouští use case ve stejném vlákně.

### Major Incident Mode

- Aktivní relevantní incident nahradí standardní úvod pouze v prázdné konverzaci.
- Zobrazení vyžaduje zapnutou funkci, aktivní stav, neuplynulé datum a relevantní targeting.
- Demo je označeno „Ukázkový incident“ a netvrdí, že je zasažena konkrétní neznámá lokalita.
- „Řeším něco jiného“ obnoví standardní carousel v téže konverzaci.
- Demo URL: `/chat?scenario=incident`; testovací varianty `incident-local`, `incident-resolved`, `incident-irrelevant` a `incident-expired`.

### Internet troubleshooting

- Tři konzistentní mediakarty a externí CTA pouze v první kartě.
- Instrukční médium používá `object-fit: contain`; celý obrázek zůstává viditelný.
- Restart odpovídá aktuálnímu veřejnému doporučení: 1 minuta odpojení a 5 minut po zapojení.
- Feedback řešení úlohy: „Funguje už připojení?“ se samostatnou lokální událostí `task_resolution`.
- Obecné hodnocení odpovědi používá `answer_helpfulness`; obě varianty se u jedné odpovědi nekombinují.

## Ověření

- ESLint bez chyb.
- Produkční build bez chyb.
- Interaktivně ověřeno 320, 360, 390, 430 a desktop 1280 px.
- Na všech mobilních šířkách: celý disclaimer, tři 44px hlavičkové cíle, žádný horizontální ani page scroll.
- Ověřeny šipky a klávesy carouselu, zavření a obnovení konverzace, nový chat, externí odkaz, explicitní feedback a návrat z incidentu.
- Ověřeny aktivní lokální a rozsáhlý incident; resolved, irrelevant a expired obnovují standardní úvod.

## Mocky a otevřené body

- Incidenty jsou pouze bezpečná demo data. Produkční incident feed, oprávněná manuální aktivace a zákaznické targeting údaje neexistují.
- Stav operátora je demo; Genesys a skutečný handover neexistují.
- Přihlášení zákazníka a zachování historie přes autentizaci neexistují.
- Feedback události jsou pouze v paměti prototypu, bez produkční analytiky.
- SVG správného zapojení je prototypová ilustrace, ne ověřená fotografie konkrétního modemu. Před produkcí je potřeba schválený asset nebo zařízení-specifický obsah.
- Vodafone TV nemá samostatný kurátorovaný scénář; karta používá existující retrieval a neslibuje konkrétní opravu.
- Softwarová klávesnice a skutečný odečítač obrazovky vyžadují následné zařízení/lab ověření.

## Další doporučený krok

Po kontrole těchto tří obrazovek pokračovat eSIM zjednodušením a teprve poté navrhnout backendový kontrakt handoveru. Neimplementovat Genesys nebo zákaznické přihlášení bez skutečných API, bezpečnostních pravidel a datových vlastníků.
