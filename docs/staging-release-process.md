# Staging release proces

Tento dokument definuje proces; nespouští deployment. Automatický staging deployment je nyní **BLOCKED**, protože repository neobsahuje ověřený staging target, URL, deploy příkaz/API, CI identitu a credentials, rollback ani autentizaci pro post-deploy smoke testy.

## Orchestrace

1. Hlavní agent klasifikuje dopad požadavku a zkontroluje working tree.
2. `tobi_architect` se zapojí před implementací u architektury, LLM, databáze, RAG, bezpečnosti, externí služby, významných nákladů nebo velkého refaktoringu. Významný návrh schvaluje Product Owner.
3. `tobi_ux` navrhne a po implementaci zkontroluje zákaznické UI, flow, navigaci a podstatnou copy změnu.
4. `tobi_developer` implementuje produkční kód a odpovídající unit/integration testy.
5. `tobi_qa` nezávisle ověří změnu a vrátí defekty s důkazy.
6. `tobi_documentation` aktualizuje verzované zdroje. Tato změna je součástí release kandidáta.
7. Na finálním SHA se znovu provedou všechny kontroly; Documentation Specialist vydá READY/NOT READY a QA finální GO/NO-GO.
8. Platný gate smí automaticky spustit pouze ověřený staging mechanismus. Po deployi následují smoke testy.

Po dvou neúspěšných pokusech opravit stejný defekt se cyklus zastaví a eskaluje se SHA, evidence, pokusy, dopad, vlastník a doporučené rozhodnutí.

## Commit-bound gate

Manifest je JSON validovaný příkazem:

```powershell
npm run release:validate -- path/to/staging-gate.json
```

Validátor porovná manifest s aktuálním `git rev-parse HEAD` a vyžaduje pro stejný 40znakový SHA:

- Developer READY;
- PASS pro `clean-checkout`, `install`, `lint`, `typecheck`, `regression` a `build` včetně příkazu, času a odkazu na evidence;
- Architecture a UX review jako COMPLETE, pokud jsou povinné, jinak explicitně NOT_REQUIRED;
- Documentation READY;
- finální QA GO;
- nula otevřených kritických funkčních nebo bezpečnostních defektů;
- VERIFIED deployment prerequisites: staging URL, mechanismus, CI identita, rollback, smoke autentizace a dohledatelná evidence;
- prostředí `staging` a žádné znovupoužití produkčního approval.

Jakákoli změna kódu, testu, konfigurace nebo dokumentace vytvoří nový SHA a ruší předchozí attestace. Soubor `release/staging-gate.example.json` je záměrně neplatná šablona a nikdy nepředstavuje schválení.

Lokální JSON není autentizovaná identita schvalovatele. Po doplnění skutečného CI/CD musí být QA a Documentation potvrzení reprezentováno chráněným commit statusem, environment approval nebo podepsaným artefaktem.

## Staging a produkce

Staging po splnění gate nevyžaduje další souhlas Product Ownera. QA NO-GO nebo Documentation NOT READY staging blokuje.

Produkce vždy vyžaduje výslovný souhlas Product Ownera pro konkrétní produkční release. Staging GO se nesmí považovat za produkční approval. Změny secrets, oprávnění, veřejného sdílení, produkčních dat, DNS/domén nebo významných nákladů vyžadují samostatné schválení.

## Podmínky odblokování automatického stagingu

Před vytvořením deploy jobu musí vlastník prostředí dodat a ověřit:

- jednoznačný staging projekt/target a URL odlišné od produkce;
- nedestruktivní deploy command nebo API a immutable artefakt;
- CI identitu, minimální oprávnění a bezpečné secrets;
- migrace a ochranu staging dat;
- health check, bezpečný rollback a incident záznam;
- administrátorskou autentizaci pro smoke test bez uložení credentials v repository.

Zavedení nového CI/CD poskytovatele nebo změna uvedených oprávnění je nové architektonické a bezpečnostní rozhodnutí.

## Post-deploy smoke kontrakt

Po skutečném staging deploymentu zaznamenej SHA, artifact ID, cílovou URL, čas, vykonavatele a výsledek:

1. aplikace a status endpoint odpovídají;
2. základní zákaznická konverzace vrátí bezpečnou odpověď a podporované UI bloky;
3. navazující dotaz zachová kontext;
4. administrace je dostupná pouze autorizované identitě a zápis se bezpečně ověří;
5. nevznikají kritické chyby ani únik secrets/citlivých dat.

Při selhání zastav rollout a použij pouze předem ověřený rollback. Dokud staging URL a autentizace chybí, smoke výsledek je **BLOCKED**, ne PASSED.

## Cílový Vercel / Supabase kandidát

Primární lokální framework je Next 16.3.4; provozní postup a konkrétní blokery popisuje `docs/vercel-supabase.md`. SQL migrace byla vykonána pouze v lokálních PGlite testech, bez aplikace na vzdálenou DB nebo přenosu dat. Žádný vzdálený projekt nebyl vytvořen. Instalace pg a PGlite z offline npm cache uspěla; lokální SQL testy ověřují migraci, seed/read, JSON, timestamp, CAS/souběh a RLS/grants; interní přístup je fail-closed do implementace schválené serverem ověřené session. Aktuální lokální testy nejsou důkazem staršího release ani nasazení na Vercel. Historická evidence se nepřepisuje.
