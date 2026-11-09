# Lokální demo a známé vady

Tento checkpoint je vývojový základ, nikoli schválený staging nebo produkční release. Uživatel výslovně zvolil zprovoznění základní verze se známými chybami a jejich následné postupné opravy. Zákaznický kód se kvůli těmto zjištěním v tomto checkpointu nemění. Úspěšné existující testy neznamenají, že níže uvedené vady neexistují.

## Lokální spuštění bez vzdálených služeb

```sh
TOBI_IN_MEMORY_CONFIG=true npm run dev -- --port 15175
```

Aplikace poslouchá pouze na `127.0.0.1:15175`. Pro spuštění nepoužívejte produkční credentials ani produkční databázi. Pro čistě lokální demo ponechte `OPENAI_API_KEY` a `DATABASE_URL` nenastavené. Paměťová konfigurace je dostupná pouze mimo production a po restartu se ztrácí. Interní `/admin`, `/doc` a admin API zůstávají zamčené; zabezpečení se pro demo neobchází. Operátor je simulovaný. Veřejné nasazení, vzdálená databáze a ověřený poskytovatel interní identity nejsou tímto checkpointem vyřešeny.

Běžné E2E používá samostatný port `15173`:

```sh
npm run test:tariff-e2e
```

## Otevřené funkční vady

- **DEMO-01 — Internet bez fotodiagnostiky:** při vypnutém `routerPhotoDiagnostics` začne scénář v `text-path` bez historie, ale validátor očekává `photo-offer`; obě nabízená pokračování odmítne. Reprodukováno na úrovni funkcí. Soubory: `lib/demo-scenario-catalog.ts`.
- **DEMO-02 — Chybové přechody:** zpráva neplatného přechodu neodpovídá literal kontraktu `chatErrorV1Schema`; místo zamýšleného HTTP 409 může handler skončit fallbackem HTTP 502. Nesoulad schématu reprodukován, úplný HTTP průchod nebyl samostatně reprodukován. Soubory: `lib/chat-v1-server.ts`, `lib/contracts/chat/v1.ts`.
- **DEMO-03 — Přepnutí na tarif:** explicitní tarifní dotaz s předaným stavem jiného scénáře nezačne deterministické porovnání tarifů. Zjištěno review a trasováním zdroje; samostatná interaktivní reprodukce zatím chybí. Soubor: `lib/chat-v1-server.ts`.
- **DEMO-04 — Mezní tarifní preference:** některé hodnoty rozpočtu/dat vedou k preferencím neplatným podle schématu; rozpočet 20 reprodukoval `ZodError`. Soubor: `lib/tariff-comparison.ts`.
- **DEMO-05 — Negace u simulovaného operátora:** `nefunguje` obsahuje `funguje` a může vyvolat kladnou odpověď místo řešení problému. Reprodukováno na úrovni funkce. Soubor: `lib/mock-operator.ts`.
- **DEMO-06 — Délka zprávy operátorovi:** UI dovoluje 4000 znaků, API pouze 2000; klient navíc nezpracuje neúspěšný HTTP stav správně. Zjištěno review zdroje, bez samostatné UI reprodukce. Soubory: `components/tobi-studio.tsx`, `app/api/operator/route.ts`.
- **DEMO-07 — Souběh při předání operátorovi:** předání nezneplatní rozpracovanou generaci botovy odpovědi; opožděný výsledek může aktualizovat chat nebo busy stav. Zjištěno review zdroje, bez samostatné časované UI reprodukce. Soubor: `components/tobi-studio.tsx`.

Opravy provádějte jednotlivě s reprodukujícím regresním testem, následnou kontrolou a aktualizací tohoto seznamu. Tato evidence není QA GO ani povolení veřejného nasazení.
