# TOBi – první iterace (fáze 0–5)

Datum ověření: 31. 10. 2026

## Architektura před změnou

- `components/tobi-studio.tsx` obsahoval prototypové rozhraní, stav konverzace, vykreslování zpráv a pravý inspektor.
- `app/api/chat/route.ts` vybíral kurátorované scénáře, vyhledával ve veřejné znalostní bázi a volitelně používal OpenAI Responses API.
- `lib/vodafone-knowledge.ts` obsahoval deterministické scénáře a odkazy na veřejné stránky Vodafone.
- Stav operátora byl jen boolean, konfigurační volby byly rozptýlené v komponentě a postupy používaly pevnou mřížku reagující na viewport.

## Změny v první iteraci

- `lib/tobi-config.ts`: validovaná konfigurace UI (Zod), samostatné runtime stavy a datový model mediakaret.
- `components/tobi/media-carousel.tsx`: znovupoužitelný carousel s dotykem, myší, klávesami, šipkami, indikací pozice a variantami carousel/karty/seznam.
- `components/tobi-studio.tsx`: nová bílá hlavička, přesný AI disclaimer, čtyři ovládací prvky, tříhodnotový stav operátora, skryté časy, nenápadné zdroje a vykreslování mediakaret.
- `lib/vodafone-knowledge.ts`: referenční domácí internetový scénář a tři mediakarty.
- `app/api/chat/route.ts`: mediakarty v odpovědi API a deterministická odpověď pro referenční internetový scénář.
- `public/tobi/*.svg`: tři lokální ilustrace, aby prototyp nebyl závislý na neověřeném externím médiu.

Konfigurace, runtime a AI konfigurace zůstávají oddělené. Runtime stav operátora ani přihlášení se nevydávají za skutečná data.

## Referenční chování

Dotaz `Nefunguje mi internet doma.` vrací přesný úvod a tři karty: ověření výpadku, kontrolu připojení a restart modemu. První karta vede na ověřenou adresu `https://www.vodafone.cz/vypadky/`. Negativní zpětná vazba pokračuje další diagnostikou a neopakuje carousel.

Nová odpověď se posune na svůj začátek jen tehdy, pokud zákazník během čekání nezůstal ve starší historii. Jinak se ukáže tlačítko „Nová odpověď“. Reset zneplatní rozpracovanou odpověď, aby nepřetekla do nové konverzace.

## Ověření

- ESLint: bez chyb a varování.
- Produkční build: úspěšný.
- Živě ověřené šířky: 320, 360, 390, 430 a desktop 1280 px.
- Na 320 px jsou všechny čtyři hlavičkové cíle celé a 44 × 44 px; stránka nemá horizontální overflow.
- Na úzkém widgetu je jedna karta a náhled další; na širokém widgetu dvě celé karty.
- Šipky, klávesy vlevo/vpravo, sbalené zdroje, stav operátora a negativní pokračování byly ověřené v prohlížeči.

## Známé limity a otevřené otázky

- Přepojení na operátora není implementované; hlavička pravdivě ukazuje jen demo stav a informační popover.
- Přihlášení zákazníka, historie napříč relacemi, perzistence konverzace a Genesys integrace nejsou v rozsahu fází 0–5.
- AI prompt, model, evaly a administrace nejsou součástí zákaznického UI této iterace.
- Aktuální stránka Vodafone doporučuje odpojit modem přibližně na 1 minutu a poté čekat 5 minut. Zadání vyžaduje text „30 sekund“, proto jej prototyp zachovává; před produkcí je nutné copy obsahově schválit.
- Dostupnost operátora nemá datový zdroj. Výchozí stav je proto `unknown`, ne online/offline.
- Ilustrace jsou prototypové lokální SVG a před produkcí potřebují brand/design schválení.

## Doporučená další fáze

Nejdřív definovat kontrakt handoveru (dostupnost, fronta, předávaný kontext, chybové stavy a návrat k AI), potom zákaznické přihlášení a ochranu citlivých údajů. Až poté dává smysl přidat operátorskou integraci a administraci AI konfigurace.
