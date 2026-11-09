# Architektura současného řešení

## Tok zákaznické zprávy

1. Zákaznické UI sestaví omezenou historii a explicitní stav scénáře.
2. POST `/api/chat/v1` předá požadavek serverovému handleru.
3. Server načte aktivní konfiguraci, validuje ChatRequest v1 a rozhodne mezi stavovým scénářem, tarifním flow, RAG a upřesněním.
4. Výsledek z lokálních znalostí nebo OpenAI Responses API se převede na omezený ChatResponse v1.
5. Zod validace odmítne neznámé bloky, nebezpečné odkazy a neplatné vazby zdrojů.
6. Centrální renderer zobrazí pouze podporované UI bloky.

## Srovnání tarifů

Tarifní větev je deterministická a běží uvnitř stejného ChatResponse v1. Parser převede zákaznický požadavek na omezené preference, ale výběr, ceny a parametry bere aplikace výhradně z `data/vodafone-mobile-tariffs.v1.json`. Stav ukládá preference, doporučená katalogová ID a povolené přechody. Blok `tariffComparison` přijme 1–3 unikátní tarify, jejich bezpečné HTTPS detaily a stejné porovnávané atributy. Jednokartový carousel je zároveň výsledkem i přímým srovnáním: zákazník prochází všechny doporučené tarify šipkami, klávesnicí nebo gestem a může rovnou změnit požadavky. Aktuální cesta nenabízí druhý tabulkový krok ani samostatné CTA Porovnat.

Model nesmí přidat tarif, cenu, produktový atribut ani objednávkovou akci. Neznámé ID, neplatný přechod, nulová přesná shoda nebo katalog starší než sedm dní vedou do validovaného fallbacku s viditelným omezením.

## Ukládání

Aktivní konfigurace je jeden verzovaný JSONB záznam v PostgreSQL přes lazy Node pg adapter (pg je připnutá runtime závislost). Veřejné API vrací pouze bezpečnou projekci bez system promptu a modelových parametrů. Konverzace zákazníka se v tomto repository trvale neukládají. Znalostní index i tarifní katalog jsou verzované JSON snapshoty veřejných stránek Vodafone.cz.

## Hranice důvěry

Klient nemá přístup k API klíči. Administrace a tato dokumentace používají Supabase Auth getUser a serverový UUID allowlist; bez platné konfigurace jsou fail-closed. Nepodepsané Sites hlavičky ani vývojové identity neopravňují k přístupu. Raw výstup modelu ani Markdown se nevykonává jako HTML nebo JavaScript.

## Chyby a fallback

Neplatný modelový výstup se pokusí zachránit jen jako bezpečný prostý text; jinak následuje pevná bezpečná odpověď. Nedostupný OpenAI provider v podporovaných místech přechází na lokální nebo deterministický fallback. Tyto fallbacky nesmí předstírat úspěšnou backendovou operaci.
