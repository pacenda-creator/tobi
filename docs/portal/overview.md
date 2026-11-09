# Co je TOBi Prototype

TOBi Prototype je interní experimentální aplikace pro ověřování zákaznického chatového rozhraní, telco znalostí, strukturovaných odpovědí a bezpečných konverzačních flow.

## Pro koho je dokumentace

- produktový vlastník: orientace v reálně dostupných schopnostech a omezeních,
- vývoj: vazba chování na konkrétní moduly a konfiguraci,
- testování: dohledatelné regresní případy a skutečné výsledky běhů.

## Co prototyp není

Prototyp nemá přístup k zákaznickému účtu, routeru ani produkčním systémům Vodafonu. Operátor je simulovaný. Režim bez OpenAI API používá deterministické demo a lokální znalosti. Přítomnost kódu nebo testu není důkazem produkčního nasazení.

## Základní pojmy

- **ChatResponse v1**: serverově validovaný kontrakt textu, UI bloků, zdrojů a stavu flow.
- **Scénář**: explicitní stavový tok pro podporovanou situaci.
- **RAG**: odpověď založená na lokálním indexu veřejného Centra péče.
- **PostgreSQL konfigurace**: verzovaná aktivní konfigurace prototypu.
- **Mock handover**: simulované předání operátorovi bez napojení na kontaktní centrum.
- **Tarifní katalog**: verzovaný snapshot veřejných mobilních tarifů Vodafone.cz; ceny a parametry se nevytvářejí modelem a po sedmi dnech se katalog považuje za zastaralý.
- **Srovnání tarifů**: stavové konverzační flow doporučí 1–3 katalogové tarify v jednokartovém carouselu, který je zároveň přímým srovnáním. Prototyp poskytuje parametry a externí detail, nikoli druhý tabulkový krok, objednávku nebo personalizovanou nabídku.
