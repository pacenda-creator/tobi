# TOBi agenti v Hermes

## Import

Rozbal adresář `agents/` do pracovní kopie aktuálního repozitáře TOBi na samostatné větvi. Při kolizi se stávajícím souborem porovnej obsah před sloučením. Do existujících projektových instrukcí, které Hermes v tomto checkoutu skutečně načítá, doplň tento odkaz:

> Pro vývoj TOBi načti z kořene repozitáře `agents/README.md` a `agents/workflow.md`. Mapování rolí a závislostí najdeš v `agents/manifest.json`.

`originals/` obsahuje původní export včetně historických poznámek. Pro běh používej `workflow.md` a `roles/`. Manifest eviduje kontrolní součty všech dodaných souborů s výjimkou sebe sama.

## Spuštění rolí

1. Hermes koordinuje postup a z manifestu vybere relevantní role. Před předáním načte celý soubor role, příslušné projektové instrukce a závislosti. Specialistovi předá zadání, kořen checkoutu, příslušné instrukce, omezení a kandidátní SHA, pokud už existuje.
2. Implementaci zadej Codex CLI s instrukcemi Developera. UX, Architekt, QA a Dokumentace mohou běžet jako samostatná volání Hermes `delegate_task`, pokud je na dané instalaci ověřená delegace. Vlož instrukce a relevantní podklady do `context`. Koordinátor řeší předávky mezi rolemi. Původní volby Codex modelů v manifestu jsou podkladem pro nastavení. Ověř efektivní model a reasoning na VPS a zapiš odchylky. Samotná instrukce role nevynucuje oprávnění nástrojů.
3. Po změně dokumentace dokonči finální commit a nech Dokumentaci potvrdit READY a QA vydat GO nebo NO-GO pro tentýž SHA. Ověř všechny podmínky stagingu v `workflow.md`. Staging po splnění podmínek probíhá automaticky. Produkci autorizuje Product Owner přes WhatsApp pro konkrétní otestovanou verzi.

## První ověření

V režimu čtení ověř, že Hermes načte všech pět rolí a UX reference z checkoutu. U každé role nech samostatný běh vrátit její jméno, konkrétní kompetenci a jedno omezení. Zaznamenej použitý model a způsob spuštění. Ověř dostupnost Codex CLI, delegace a existující cesty na staging, včetně kontroly, která chrání produkci.

Pak ručně spusť jednu malou položku z backlogu s jasnými akceptačními kritérii. Pro ověření záporné větve předlož kandidáta s chybějícím povinným výsledkem kontroly v režimu bez nasazení a ověř, že QA vrátí NO-GO a staging se nespustí. Úspěšnou větev uzavři výsledky smoke testů a žádostí o schválení produkce pro konkrétní SHA.
