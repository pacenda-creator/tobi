# Lokální migrace na Vercel / Next.js a Supabase

Stav: rozpracovaný lokální kandidát, nikoli nasazený release. Žádný vzdálený projekt ani DB nebyly vytvořeny, připojeny nebo migrovány. Původní Sites export a historická evidence zůstávají samostatné.

## Primární cesta

`npm run install:ci` používá npm ci bez lifecycle scripts a ověřuje Next executable. `npm run dev` spouští Next dev na 127.0.0.1:3000, `npm run build` skutečně spouští `next build --webpack` s připnutým Next 16.3.4, `npm start` spouští Next production server na stejném hostu/portu. Vercel používá tyto stejné skripty. TypeScript 5.9 se při buildu kontroluje přes compiler API (`useTypeScriptCli: false`); kontroly typů nejsou vypnuté. Serverové Markdown importy používají webpack asset/source. Orchestrátor má implementaci `.ts` a kompatibilní historický `.mts` reexport.

Sites/Vinext, D1 schema a instalační shell helper jsou neaktivní historický scaffolding. Produkční config store je neimportuje. Při následném úklidu je lze odstranit samostatně; nejde o primární dev/build/start cestu.

## Závislosti a lokální SQL

Z veřejné offline npm cache byly s vypnutými install scripts nainstalovány přesné verze runtime `pg@8.23.1` a dev `@types/pg@8.23.1`, `@electric-sql/pglite@0.5.15`. npm aktualizovalo package.json i package-lock.json. Driver používá lazy `await import("pg")` uvnitř serverového poolu a `serverExternalPackages`; Next automaticky trasuje runtime závislosti bez ručních tracing globů. Ověřený build bez DATABASE_URL obsahuje v osmi serverových `.nft.json` trace skutečné pg a tranzitivní soubory (55 souborů na trace, žádný chybějící). Konzervativní trace zahrnuje i volitelný upstream `pg-cloudflare`; Node větev pg používá `net.Socket` a tento adaptér ani Cloudflare/Vinext/Wrangler/Miniflare runtime nenačítá. Trace není seznam skutečně načtených modulů.

`npm run test:migration` vyžaduje PGlite a skutečně lokálně vykonává migrační SQL, seed/read, JSON, timestamp, CAS/souběh a RLS/grants. Chybějící balíček je chyba testu, nikoli skip. Fake-client test samostatně kontroluje parametrizovaný SQL kontrakt. Žádný test nepřipojuje vzdálenou DB.

`npm run db:generate` je **legacy SQLite/D1** generátor podle `drizzle.config.ts`; není generátorem Supabase migrací. PostgreSQL migrace je verzovaný SQL soubor v `supabase/migrations/`. Primární install:ci/dev/build/start zůstávají Next/Vercel.

## Konfigurace a přístup k DB

Secrets v `.env.example` zůstávají prázdné; nesenzitivní testovací default je uveden jako `TOBI_E2E_PORT=15173`. `DATABASE_URL` patří pouze důvěryhodnému Node serveru; nikdy do `NEXT_PUBLIC_*`, klientského kódu nebo logů. Pro serverless použijte Supabase transaction pooler. Adapter používá `pg.Pool`, max 2 spojení, connect timeout 5 s a idle timeout 10 s. Volá `query(text, values)` bez jmenovaných prepared statements. TLS vždy ověřuje certifikát (`rejectUnauthorized: true`); URL parametry schopné přepsat TLS nastavení se odstraní. Pokud je potřeba vlastní CA, musí být spravována důvěryhodně v serverovém prostředí; nevypínejte ověřování certifikátu.

Pool vzniká až při prvním DB požadavku, nikoli při importu nebo buildu. Chybějící `DATABASE_URL` vyvolá jasnou chybu, veřejné config/chat/status API vrací 503 `config_unavailable`. Není tu produkční paměťový fallback. Explicitní `TOBI_IN_MEMORY_CONFIG=true` funguje výhradně mimo production pro lokální dev/test a nedává oprávnění k administraci. Po restartu nejsou paměťová data zachována. Bez modelového API klíče zůstává zákaznické demo dostupné, ale vyžaduje funkční config store nebo explicitní lokální paměť.

Tabulka `public.tobi_configurations` má jediný řádek `active`, celočíselnou `config_version`, JSONB `config` a timestamptz `updated_at`. Seed používá `ON CONFLICT (id) DO NOTHING`, poté čte vítězný řádek. Update provádí atomicky `WHERE id=$3 AND config_version=$4 RETURNING`, zvyšuje verzi v DB a při neúspěchu vyvolává stávající version conflict s aktuální konfigurací. Žádná zákaznická data se nepřenášejí.

SQL `supabase/migrations/20261109000000_tobi_configurations.sql` je pouze vytvořený soubor, **nebyl aplikován na vzdálenou DB** (lokální PGlite test jej vykonává). Migraci smí oprávněný provozovatel ručně aplikovat přes direct connection až na schválenou cílovou DB. Aplikace migrace nespouští. Preview/staging a production musí mít oddělené databáze, role i secrets; preview nesmí číst produkční config. Žádný automatický import D1 dat neexistuje.

Config obsahuje neveřejný system prompt: RLS je zapnuté, nejsou veřejné policies a odebrány jsou všechny table grants PUBLIC a existujícím rolím anon/authenticated. SQL je určené pro novou cílovou tabulku bez dříve vytvořených policies. Přístup má pouze důvěryhodný serverový DB owner nebo role s BYPASSRLS a nezbytnými explicitními grants. Browser ani Supabase Data API tento config číst nesmějí. Pro runtime nesmí být použita klientská anon/authenticated role.

## Interní autentizace: BLOCKED

Nový identity provider zatím nebyl určen. `/admin`, `/doc` a admin config API jsou fail-closed pro všechny identity. Nepodepsané `oai-authenticated-*` hlavičky se nepovažují za ověřenou identitu; `getChatGPTUser` vrací null. Allowlist, localhost, vývojové identity ani lokální token/cookie přístup neodemknou. Neexistuje produkční přepínač pro důvěru Sites hlavičkám. Platformní signin/signout odkazy se nezobrazují.

Odblokování vyžaduje samostatně schválenou a implementovanou serverem ověřenou session/identitu a novou bezpečnostní revizi. CSRF origin, JSON content type, délkové/schema/version validátory zůstávají v admin API pro budoucí ověřenou autentizaci. Veřejný zákaznický chat nepotřebuje interní login; tarify, RAG, prompt a scénáře se touto migrací obsahově nemění.

## Ověření bez DB

`node scripts/run-next-build-no-db.mjs` odstraní connection proměnné DATABASE_URL, POSTGRES_* a SUPABASE_* z prostředí potomka a spustí skutečné `npm run build`; nevytváří dummy credentials. V tomto checkoutu není `.env.local` ani jiný env soubor s hodnotami. Před host ověřením zajistěte totéž, protože Next může env soubory načítat. Runtime logy, RED/GREEN a build výstupy jsou v ignorovaném `.sites-runtime/migration/`. Nejde o release evidenci ani schválení nasazení.

## Bezpečná serverová diagnostika PostgreSQL

Adapter volá `console.error("TOBi PostgreSQL failure", JSON.stringify({ phase, code, category }))`: přesně dva string argumenty, JSON má pouze klíče `phase`, `code`, `category` v tomto pořadí. Například `TOBi PostgreSQL failure {"phase":"query","code":"28P01","category":"authentication"}`. Fáze jsou `initialization`, `provider` (injektovaný provider), `query`, `idle_pool`. Inicializace výchozího poolu se hlásí před nahrazením chyby bezpečnou obecnou zprávou; znovu se nehlásí jako provider.

Pevný allowlist mapuje `28P01` → `authentication`, `42501` → `permission`, `42P01` → `schema`, `ECONNREFUSED` → `connection`, `ETIMEDOUT` → `timeout`, `ENOTFOUND` → `dns` a `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED` → `tls`. Ostatní hodnoty se nikdy neopisují: fallback je `UNKNOWN` / `unknown`. Neznámý kód není diagnóza příčiny incidentu.

Prohlížejí se pouze `code` a řetězec `cause`, nejvýše čtyři uzly včetně původní chyby; cyklus a házející gettery zpracování bezpečně ukončí nebo přeskočí. Message, stack, SQL a další raw data se nelogují ani neukládají do vyhazované cause. Config routy logují pouze své pevné kontextové zprávy; HTTP odpovědi neobsahují diagnostická metadata. Živý Vercel incident nebyl tímto lokálním ověřením reprodukován.
