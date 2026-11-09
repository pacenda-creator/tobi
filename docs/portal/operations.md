# Provoz a údržba

## Lokální spuštění

```powershell
npm run dev
```

Primární cesta používá Next 16.3.4 na portu 3000; `npm run build` je Next webpack build a `npm start` je Next production server. Bez `OPENAI_API_KEY` jsou odpovědi demonstrační; konfigurace vyžaduje PostgreSQL nebo explicitní lokální `TOBI_IN_MEMORY_CONFIG=true` mimo production. Interní admin i dokumentace vyžadují Supabase Auth getUser a serverový UUID allowlist, i na localhostu.

Podrobný provozní postup, offline instalace pg/PGlite a lokální SQL testy, TLS, serverový transaction pooler, oddělené preview/production databáze a ruční SQL migrace jsou v `docs/vercel-supabase.md`. Žádná vzdálená migrace nebyla spuštěna a nejde o nasazený release.

## Povinné kontroly

```powershell
npm run docs:validate
npm run typecheck
npm run lint
npm run test:chat-contract
npm run test:tariff-e2e
npm run test:release-gate
npm run build
```

## Tarifní E2E

`npm run test:tariff-e2e` používá verzovaný `playwright.config.ts` a vlastní Next server na `127.0.0.1:15173`. BaseURL, kontrolní URL i `npm run dev -- --port` používají shodný port. `reuseExistingServer=false` platí vždy: obsazený port znamená chybu, cizí služba se nepřebírá. Osm scénářů běží s `workers: 1` a `retries: 0`.

Override v POSIX shellu: `TOBI_E2E_PORT=15174 npm run test:tariff-e2e`. V PowerShellu nastavte `$env:TOBI_E2E_PORT="15174"` a spusťte `npm run test:tariff-e2e`. Proměnná musí obsahovat pouze desetinné číslice s hodnotou 1..65535; prázdná hodnota, mezery, desetinná čísla i přípony jsou chyba. `.env.example` dokumentuje proměnnou; pro override ji exportujte v shellu, Playwright soubor `.env` nenačítá.

Regrese konfigurace: `npm run test:e2e-config` (bez naslouchání na portu). Plný browserový běh vyžaduje prostředí dovolující listen; sandbox s `listen EPERM` jej neověří. Na hostu použijte stejný běžný příkaz bez dočasného configu. Screenshoty, logy, `.playwright-results` a případné Nextem generované `AGENTS.md`/`CLAUDE.md` jsou generované výstupy a nepatří do commitu.

## Údržba dokumentace

Při změně funkce, kontraktu, konfigurace nebo testu aktualizujte odpovídající položku v `docs/portal/`. Automatizovaný test musí odkazovat na skutečný soubor a přesný název `test(...)`. PASS nebo FAIL smí být uveden jen s datem, revizí, příkazem a evidencí skutečného běhu.

## Konfigurační proměnné

- `OPENAI_API_KEY`: serverové volání OpenAI Responses API.
- `DATABASE_URL`: serverový PostgreSQL transaction pooler, nikdy NEXT_PUBLIC.
- Interní autentizace: Supabase Email Password, getUser a TOBI_ADMIN_USER_IDS; původní allowlisty a lokální tokeny přístup neudělují.
- `TOBI_IN_MEMORY_CONFIG`: netrvalý lokální fallback bez DB; v production ignorován.
- `TOBI_ROUTER_VISION_MODEL`: model pro analýzu fotografie routeru.
- `TOBI_ROUTER_VISION_FIXTURES_ENABLED`: přesný staging-only testovací fixture; výchozí stav je vypnuto.

Hodnoty secrets se nikdy neukládají do dokumentace ani klientského bundle.

## Údržba tarifního katalogu

`data/vodafone-mobile-tariffs.v1.json` je kontrolovaný snapshot, nikoli live API. Nejméně jednou za sedm dní je nutné proti veřejné stránce Vodafone.cz ověřit názvy, samostatné měsíční ceny, běžné ceny, objem nebo rychlost dat, podmínky a detail URL. Po změně upravte `checkedAt` a verzi katalogu, spusťte kontraktní i Playwright testy a aktualizujte evidenci v `/doc`. Pokud je katalog starší, aplikace ceny nepředstavuje jako aktuální a místo srovnání nabídne odkaz na veřejnou nabídku.

## Nasazení a rollback

Repository neobsahuje ověřený automatický deploy příkaz, CI identitu ani rollback mechanismus. Verzovaný release gate proto validuje evidenci, ale deployment sám nespouští. Dokud tyto předpoklady nejsou ověřené, automatizovaný staging deployment je BLOCKED.
