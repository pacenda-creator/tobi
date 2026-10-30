export type KnowledgeCard = {
  id: string;
  label: string;
  shortLabel: string;
  triggers: string[];
  answer: string;
  steps: string[];
  sourceTitle: string;
  sourceUrl: string;
  quickReplies: string[];
  actionLabel?: string;
  actionUrl?: string;
  warning?: string;
};

export const vodafoneKnowledge: KnowledgeCard[] = [
  {
    id: "internet",
    label: "Potíže s pevným internetem",
    shortLabel: "Internet nefunguje",
    triggers: ["internet nefunguje", "nejde internet", "nejde wifi", "wi-fi nefunguje", "výpadek internetu", "nejde net", "pomalý internet"],
    answer: "Pomůžu vám zjistit, proč pevný internet nefunguje. Začněme nejrychlejšími kontrolami — bez resetu do továrního nastavení.",
    steps: [
      "Ověřte výpadek na své adrese.",
      "Zkontrolujte napájení a oba konce kabelů.",
      "Odpojte modem na 30 sekund a po zapojení několik minut počkejte.",
      "Vyzkoušejte připojení na jiném zařízení.",
    ],
    sourceTitle: "Vodafone Centrum péče · Pevný internet",
    sourceUrl: "https://www.vodafone.cz/pece/reseni-technickych-problemu/nemuzu-datovat/nefunguje-pripojeni-k-internetu/",
    quickReplies: ["Zkontrolovat výpadek", "Modem stále bliká", "Spojit s člověkem"],
    actionLabel: "Ověřit výpadek",
    actionUrl: "https://www.vodafone.cz/vypadky/",
    warning: "Tovární reset nechte až jako poslední krok — smaže vlastní nastavení Wi‑Fi.",
  },
  {
    id: "esim",
    label: "Aktivace nebo přesun eSIM",
    shortLabel: "eSIM a SIM",
    triggers: ["esim", "e-sim", "aktivace sim", "přenést sim", "přesun sim", "vyměnit sim"],
    answer: "Rozumím — řešíte eSIM. Nejdřív potřebuji rozlišit, jestli ji aktivujete poprvé, nebo ji přesouváte do nového telefonu.",
    steps: [
      "Připojte telefon k internetu, ideálně přes Wi‑Fi.",
      "Nahrajte eSIM naskenováním QR kódu nebo přes přenos eSIM v telefonu.",
      "V Můj Vodafone otevřete Služby → Moje SIM / eSIM a potvrďte výměnu.",
      "Po aktivaci telefon vypněte a znovu zapněte.",
    ],
    sourceTitle: "Vodafone Centrum péče · eSIM",
    sourceUrl: "https://www.vodafone.cz/pece/muj-ucet-cislo/sim-karty/esim/",
    quickReplies: ["První aktivace", "Přesun do telefonu", "Aktivace selhala"],
    actionLabel: "Otevřít Můj Vodafone",
    actionUrl: "https://muj.vodafone.cz/",
    warning: "QR kód eSIM nikomu neposílejte. Obsahuje údaje určené jen pro vaše zařízení.",
  },
  {
    id: "billing",
    label: "Vyúčtování a platby",
    shortLabel: "Vyúčtování",
    triggers: ["vyúčtování", "faktura", "zaplatit vyúčtování", "platba faktury", "inkaso", "dlužná částka", "uctovani"],
    answer: "Pomůžu s vyúčtováním. Nejrychleji ho zobrazíte a zaplatíte v Můj Vodafone nebo v aplikaci Můj Vodafone+.",
    steps: [
      "Otevřete sekci Vyúčtování v Můj Vodafone.",
      "Vyberte správného plátce, pokud jich máte více.",
      "Pro rychlou úhradu použijte kartu, Apple Pay nebo Google Pay.",
    ],
    sourceTitle: "Vodafone Centrum péče · Úhrada vyúčtování",
    sourceUrl: "https://www.vodafone.cz/pece/vyuctovani-platby-kredit/platba-vyuctovani/jak-uhradit-vyuctovani/",
    quickReplies: ["Najít vyúčtování", "Platba se nepropsala", "Vysvětlit částku"],
    actionLabel: "Přejít na vyúčtování",
    actionUrl: "https://muj.vodafone.cz/",
  },
  {
    id: "roaming",
    label: "Roaming a služby v zahraničí",
    shortLabel: "Roaming",
    triggers: ["roaming", "data v zahraničí", "volání v zahraničí", "roamingová zóna"],
    answer: "Jasně — podíváme se na roaming. Cena i dostupný objem dat závisí na zemi, roamingové zóně a vašem tarifu.",
    steps: [
      "Zkontrolujte cílovou zemi a její roamingovou zónu.",
      "V Můj Vodafone otevřete Čerpání a ověřte dostupná data pro Zónu 1.",
      "Před cestou zkontrolujte, že máte roaming aktivní i v telefonu.",
    ],
    sourceTitle: "Vodafone Centrum péče · Roaming",
    sourceUrl: "https://www.vodafone.cz/pece/roaming-volani-do-zahranici/jak-roaming-pouzivat/roaming-rozcestnik/",
    quickReplies: ["Země v EU", "Mimo EU", "Roaming nefunguje"],
    actionLabel: "Zjistit cenu pro zemi",
    actionUrl: "https://www.vodafone.cz/roaming/",
    warning: "Švýcarsko není v Zóně 1. Na lodích a v letadlech se mohou účtovat ceny 3. zóny.",
  },
  {
    id: "pin-puk",
    label: "PIN, PUK a zablokovaná SIM",
    shortLabel: "PIN a PUK",
    triggers: ["pin", "puk", "zablokovaná sim", "bloklá sim", "odblokovat sim", "zapomenutý pin", "kód sim"],
    answer: "Pomůžu vám najít PUK nebo odblokovat SIM. Kvůli bezpečnosti sem PIN ani PUK neposílejte.",
    steps: [
      "V Můj Vodafone otevřete Služby → Moje SIM / eSIM.",
      "PUK najdete také v aplikaci Můj Vodafone+ v Účet → SIM & eSIM.",
      "Po 3 chybných PIN pokusech telefon vyžádá PUK a umožní nastavit nový PIN.",
    ],
    sourceTitle: "Vodafone Centrum péče · PIN a PUK",
    sourceUrl: "https://www.vodafone.cz/pece/muj-ucet-cislo/kody-pin-puk/zablokovany-pinpuk/",
    quickReplies: ["Najít PUK", "Nastavit nový PIN", "Nemohu se přihlásit"],
    actionLabel: "Najít PUK v samoobsluze",
    actionUrl: "https://muj.vodafone.cz/",
    warning: "Po 10 chybných zadáních PUK se SIM trvale zablokuje a je nutné vystavit novou.",
  },
  {
    id: "signal",
    label: "Signál, volání a SMS",
    shortLabel: "Signál a volání",
    triggers: ["nejde volat", "nemůžu volat", "bez signálu", "nemám signál", "potíže se signálem", "výpadek signálu"],
    answer: "Rozumím — řešíte signál nebo volání. Ověříme, jestli je příčina v síti, SIM, nebo telefonu.",
    steps: [
      "Vypněte a znovu zapněte telefon.",
      "Ověřte pokrytí a případný výpadek ve své lokalitě.",
      "Pokud můžete, vyzkoušejte SIM v jiném telefonu.",
    ],
    sourceTitle: "Vodafone Centrum péče · Potíže se signálem",
    sourceUrl: "https://www.vodafone.cz/pece/reseni-technickych-problemu/nemuzu-volat/potize-se-signalem/",
    quickReplies: ["Ověřit pokrytí", "Jen mobilní data", "Spojit s člověkem"],
    actionLabel: "Otevřít mapu pokrytí",
    actionUrl: "https://www.vodafone.cz/mapa-pokryti/",
  },
  {
    id: "usage",
    label: "Čerpání dat a aktuální útrata",
    shortLabel: "Data a útrata",
    triggers: ["kolik dat", "zbývá dat", "čerpání", "útrata", "spotřeba", "limit dat", "provoláno"],
    answer: "Aktuální spotřebu dat i průběžnou útratu najdete kdykoliv v Můj Vodafone. Ukážu vám správnou cestu.",
    steps: [
      "Přihlaste se do Můj Vodafone nebo aplikace Můj Vodafone+.",
      "Otevřete Čerpání a vyberte konkrétní telefonní číslo.",
      "Pro uzavřené období otevřete PDF v sekci Vyúčtování.",
    ],
    sourceTitle: "Vodafone Centrum péče · Aktuální čerpání",
    sourceUrl: "https://www.vodafone.cz/pece/vyuctovani-platby-kredit/aktualni-utrata-cerpani/aktualni-prehled/",
    quickReplies: ["Otevřít čerpání", "Dokoupit data", "Vysvětlit útratu"],
    actionLabel: "Zkontrolovat čerpání",
    actionUrl: "https://muj.vodafone.cz/",
  },
];

export function findKnowledge(input: string) {
  const normalized = input.toLocaleLowerCase("cs");
  return vodafoneKnowledge.find((item) => item.triggers.some((trigger) => normalized.includes(trigger))) ?? null;
}

export function knowledgeContext() {
  return vodafoneKnowledge
    .map((item) => `${item.label}: ${item.answer} Postup: ${item.steps.join(" ")} Zdroj: ${item.sourceUrl}`)
    .join("\n\n");
}
