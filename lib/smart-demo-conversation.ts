import {
  CHAT_CONTRACT_VERSION,
  chatResponseV1Schema,
  type ChatResponseV1,
} from "./contracts/chat/v1.ts";

function responseId() {
  return `smart_${crypto.randomUUID()}`;
}

function normalized(input: string) {
  return input.toLocaleLowerCase("cs").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isBroadPhoneProblem(input: string) {
  const value = normalized(input);
  const mentionsPhone = /\b(telefon|mobil|smartphone)\b/u.test(value);
  const reportsProblem = /\b(nefunguje|nejde|probl[eé]m|rozbit)/u.test(value);
  const alreadySpecific = /\b(volat|hovor|data|internet|sign[aá]l|sim|displej|obrazov|zapnout|nab[ií]j|aplikac|sms)\b/u.test(value);
  return mentionsPhone && reportsProblem && !alreadySpecific;
}

export function isAmbiguousBlockedPhone(input: string) {
  const value = normalized(input);
  const blockedPhone = /\b(zablokovan|zamknut|blokl).*(telefon|mobil)\b/u.test(value)
    || /\b(telefon|mobil).*(zablokovan|zamknut|blokl)\b/u.test(value);
  const specificMeaning = /\b(pin|puk|sim|ztracen|odcizen|ukraden|imei|obrazov|displej|k[oó]d)\b/u.test(value);
  return blockedPhone && !specificMeaning;
}

function phoneClarification(): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: "Rozumím. „Nefunguje telefon“ může znamenat několik různých věcí. Co přesně na telefonu nefunguje?",
    blocks: [{
      type: "mediaCards",
      id: "phone-problem-choices",
      cards: [
        {
          id: "phone-calls",
          title: "Volání nebo SMS",
          description: "Nejde volat, přijímat hovory nebo posílat zprávy.",
          image: { src: "/tobi/phone-calls.svg", alt: "Telefon se symbolem hovoru" },
          action: { label: "Řešit volání", action: { kind: "sendMessage", message: "Nejde volat ani přijímat hovory." } },
        },
        {
          id: "phone-data",
          title: "Mobilní data",
          description: "Internet v telefonu nefunguje, ale volání může fungovat.",
          image: { src: "/tobi/phone-data.svg", alt: "Telefon se symbolem mobilních dat" },
          action: { label: "Řešit data", action: { kind: "sendMessage", message: "Nefungují mi mobilní data, ale volání funguje." } },
        },
        {
          id: "phone-power",
          title: "Telefon se nezapne",
          description: "Displej je černý nebo telefon nereaguje na tlačítka.",
          image: { src: "/tobi/phone-power.svg", alt: "Telefon s vypnutou obrazovkou" },
          action: { label: "Řešit zapnutí", action: { kind: "sendMessage", message: "Telefon se nezapne ani po připojení nabíječky." } },
        },
        {
          id: "phone-app",
          title: "Displej nebo aplikace",
          description: "Telefon běží, ale zamrzá, padá aplikace nebo nereaguje obrazovka.",
          image: { src: "/tobi/phone-app.svg", alt: "Telefon s upozorněním aplikace" },
          action: { label: "Popsat závadu", action: { kind: "sendMessage", message: "Telefon se zapne, ale nefunguje displej nebo některá aplikace." } },
        },
      ],
    }],
    quickReplies: [],
    sources: [],
    intent: { id: "phone-clarification", label: "Upřesnění problému s telefonem", confidence: 0.96 },
    fallback: null,
  });
}

function phonePowerAnswer(): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: "Nejdřív ověříme napájení a vynucený restart. Postup se může mírně lišit podle výrobce.",
    blocks: [
      {
        type: "steps",
        id: "phone-power-steps",
        title: "Zkuste tyto bezpečné kroky",
        items: [
          { id: "charge", text: "Připojte telefon na 30 minut k funkční nabíječce a zásuvce." },
          { id: "inspect", text: "Zkontrolujte, zda není nabíjecí konektor zanesený nebo viditelně poškozený." },
          { id: "restart", text: "Zkuste vynucený restart podle návodu výrobce telefonu." },
        ],
      },
      { type: "alert", id: "phone-battery-warning", severity: "warning", title: "Bezpečnost", text: "Pokud je telefon nezvykle horký, zapáchá nebo je baterie nafouklá, odpojte ho a dál ho nenabíjejte." },
    ],
    quickReplies: [
      { id: "phone-shows-charge", label: "Ukazuje nabíjení", action: { kind: "sendMessage", message: "Telefon ukazuje nabíjení, ale stále se nezapne." } },
      { id: "phone-no-reaction", label: "Je úplně bez reakce", action: { kind: "sendMessage", message: "Telefon nereaguje ani po 30 minutách nabíjení." } },
    ],
    sources: [],
    intent: { id: "phone-power", label: "Telefon se nezapne", confidence: 0.9 },
    fallback: null,
  });
}

function blockedPhoneClarification(): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: "Abych poradil správně: co je přesně zablokované? Každá možnost má jiný postup.",
    blocks: [{
      type: "mediaCards",
      id: "blocked-phone-choices",
      cards: [
        {
          id: "blocked-sim",
          title: "SIM žádá PIN nebo PUK",
          description: "Telefon se zapne, ale SIM je zamčená nebo po chybném PINu žádá PUK.",
          image: { src: "/tobi/sim-lock.svg", alt: "SIM karta se zámkem" },
          action: { label: "Odblokovat SIM", action: { kind: "sendMessage", message: "Potřebuji najít PUK pro zablokovanou SIM." } },
        },
        {
          id: "blocked-screen",
          title: "Zapomenutý kód obrazovky",
          description: "SIM funguje, ale nemůžete se dostat přes zámek telefonu.",
          image: { src: "/tobi/phone-lock.svg", alt: "Telefon se zámkem obrazovky" },
          action: { label: "Řešit zámek", action: { kind: "sendMessage", message: "Zapomněl jsem kód zámku obrazovky telefonu." } },
        },
        {
          id: "blocked-lost",
          title: "Ztracený nebo odcizený telefon",
          description: "Chcete rychle zablokovat SIM a ochránit své zařízení.",
          image: { src: "/tobi/phone-lost.svg", alt: "Ztracený telefon s polohovým bodem" },
          action: { label: "Zabezpečit telefon", action: { kind: "sendMessage", message: "Ztratil jsem telefon a potřebuji zablokovat SIM i zařízení." } },
        },
        {
          id: "blocked-imei",
          title: "Telefon je blokovaný v síti",
          description: "Zařízení hlásí blokaci nebo se nepřihlásí do mobilní sítě.",
          image: { src: "/tobi/phone-calls.svg", alt: "Telefon bez připojení k mobilní síti" },
          action: { label: "Řešit síť", action: { kind: "sendMessage", message: "Telefon se nepřihlásí do sítě a může být blokovaný podle IMEI." } },
        },
      ],
    }],
    quickReplies: [],
    sources: [],
    intent: { id: "blocked-phone-clarification", label: "Upřesnění blokace telefonu", confidence: 0.97 },
    fallback: null,
  });
}

function lostPhoneAnswer(): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: "Jednejte co nejdřív: nejprve zablokujte SIM a potom zabezpečte samotný telefon.",
    blocks: [
      {
        type: "steps",
        id: "lost-phone-steps",
        title: "Doporučený postup",
        items: [
          { id: "block-sim", text: "Zablokujte SIM v samoobsluze nebo přes zákaznickou linku, aby ji nikdo nemohl používat." },
          { id: "locate-device", text: "Použijte službu Najít zařízení od Apple nebo Googlu, telefon označte jako ztracený a zobrazte kontaktní zprávu." },
          { id: "protect-accounts", text: "Pokud telefon neobnovíte, změňte hesla k e-mailu, bankovnictví a dalším citlivým účtům." },
          { id: "report-theft", text: "Při krádeži nahlaste událost policii a připravte si IMEI zařízení." },
        ],
      },
      { type: "alert", id: "lost-phone-alert", severity: "warning", title: "Neodstraňujte zařízení z účtu", text: "Dokud ho hledáte nebo vzdáleně zamykáte, neodebírejte ho z Apple ID ani účtu Google." },
      { type: "action", id: "lost-phone-puk", label: "Potřebuji novou SIM", action: { kind: "sendMessage", message: "Po ztrátě telefonu potřebuji náhradní SIM." } },
    ],
    quickReplies: [
      { id: "lost-iphone", label: "Je to iPhone", action: { kind: "sendMessage", message: "Ztratil jsem iPhone a potřebuji postup pro jeho zabezpečení." } },
      { id: "lost-android", label: "Je to Android", action: { kind: "sendMessage", message: "Ztratil jsem telefon s Androidem a potřebuji postup pro jeho zabezpečení." } },
    ],
    sources: [],
    intent: { id: "lost-phone", label: "Ztracený nebo odcizený telefon", confidence: 0.94 },
    fallback: null,
  });
}

function screenLockClarification(): ChatResponseV1 {
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: responseId(),
    mode: "preset",
    text: "Obnovení přístupu závisí na systému telefonu. Je to iPhone, nebo telefon s Androidem?",
    blocks: [{
      type: "infoCard",
      id: "screen-lock-warning",
      title: "Důležité",
      text: "Operátor neumí zjistit ani obejít kód zámku obrazovky. Použijeme pouze oficiální postup výrobce; ten může vyžadovat smazání zařízení.",
    }],
    quickReplies: [
      { id: "screen-lock-iphone", label: "iPhone", action: { kind: "sendMessage", message: "Zapomněl jsem kód zámku na iPhonu." } },
      { id: "screen-lock-android", label: "Android", action: { kind: "sendMessage", message: "Zapomněl jsem kód zámku na telefonu s Androidem." } },
    ],
    sources: [],
    intent: { id: "screen-lock", label: "Zapomenutý zámek obrazovky", confidence: 0.94 },
    fallback: null,
  });
}

export function createSmartDemoResponse(input: string): ChatResponseV1 | null {
  if (isAmbiguousBlockedPhone(input)) return blockedPhoneClarification();
  if (isBroadPhoneProblem(input)) return phoneClarification();
  if (/ztratil jsem telefon|odcizen[yý] telefon|ukraden[yý] telefon/u.test(normalized(input))) return lostPhoneAnswer();
  if (/zapomn[eě]l jsem k[oó]d (z[aá]mku|obrazovky)|k[oó]d z[aá]mku obrazovky/u.test(normalized(input))) return screenLockClarification();
  if (/telefon se nezapne|telefon nereaguje ani po|černý displej/u.test(normalized(input))) return phonePowerAnswer();
  return null;
}

