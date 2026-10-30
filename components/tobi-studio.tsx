"use client";

import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Headphones,
  LockKeyhole,
  Menu,
  MessageCircleMore,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Router,
  Send,
  Settings2,
  ShieldCheck,
  Signal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  WalletCards,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Tone = "friendly" | "brief" | "formal";
type Intent = { id: string; label: string; confidence: number };
type Source = { title: string; url: string; checked: string };
type AnswerCard = {
  title: string;
  steps: string[];
  warning?: string;
  actionLabel?: string;
  actionUrl?: string;
};
type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
  time: string;
  intent?: Intent;
  source?: Source | null;
  sources?: Source[];
  card?: AnswerCard | null;
  quickReplies?: string[];
  feedback?: "up" | "down";
};

const topics = [
  { id: "internet", label: "Internet a Wi‑Fi", detail: "Výpadek, modem, rychlost", icon: Router, prompt: "Nefunguje mi pevný internet" },
  { id: "esim", label: "eSIM a SIM", detail: "Aktivace, přesun, výměna", icon: QrCode, prompt: "Potřebuji aktivovat eSIM" },
  { id: "billing", label: "Vyúčtování", detail: "Platby a vysvětlení částky", icon: WalletCards, prompt: "Potřebuji poradit s vyúčtováním" },
  { id: "roaming", label: "Roaming", detail: "Data a volání v zahraničí", icon: Globe2, prompt: "Jak funguje roaming v zahraničí?" },
  { id: "pin", label: "PIN a PUK", detail: "Kódy a blokace SIM", icon: LockKeyhole, prompt: "Kde najdu PUK?" },
  { id: "signal", label: "Signál a volání", detail: "Pokrytí, hovory a SMS", icon: Signal, prompt: "Mám potíže se signálem" },
];

const knowledgeAreas = ["Tarify a služby", "Internet a data", "Vodafone TV", "Vyúčtování", "Účet, SIM a eSIM", "Telefony a zařízení", "Roaming", "Technická podpora", "OneNet"];

function timeNow() {
  return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function initialMessage(): Message {
  return {
    id: `welcome-${Date.now()}`,
    role: "assistant",
    text: "Dobrý den, jsem TOBi, AI asistent Vodafonu. Pomůžu s internetem, SIM, vyúčtováním, roamingem i voláním. Co potřebujete vyřešit?",
    time: timeNow(),
  };
}

function TobiAvatar({ small = false, inverse = false }: { small?: boolean; inverse?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`${small ? "h-9 w-9" : "h-12 w-12"} relative grid shrink-0 place-items-center rounded-full ${inverse ? "bg-white ring-4 ring-white/20" : "bg-white ring-1 ring-black/10"} shadow-[0_5px_14px_rgba(0,0,0,.14)]`}
    >
      <div className={`${small ? "h-[23px] w-[26px]" : "h-[31px] w-[34px]"} relative rounded-[45%_45%_50%_50%] border-2 border-[#4a4d4e] bg-[#e9e9e9]`}>
        <span className={`absolute ${small ? "left-[5px] top-[9px] h-1 w-1" : "left-[7px] top-[12px] h-1.5 w-1.5"} rounded-full bg-[#4a4d4e]`} />
        <span className={`absolute ${small ? "right-[5px] top-[9px] h-1 w-1" : "right-[7px] top-[12px] h-1.5 w-1.5"} rounded-full bg-[#4a4d4e]`} />
        <span className={`absolute ${small ? "bottom-[4px] left-[8px] h-[3px] w-2" : "bottom-[5px] left-[11px] h-1 w-2.5"} rounded-b-full border-b border-[#4a4d4e]`} />
        <span className={`absolute ${small ? "-top-[7px] left-[7px] h-3.5 w-3.5" : "-top-[9px] left-[9px] h-[19px] w-[19px]"} rounded-full bg-[#e60000]`}>
          <span className="absolute inset-[3px] rounded-full bg-white" />
          <span className="absolute bottom-[2px] right-[1px] h-[5px] w-[5px] rotate-45 bg-[#e60000]" />
        </span>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[#e60000]" : "bg-[#d1d1d1]"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

export default function TobiStudio() {
  const [messages, setMessages] = useState<Message[]>([initialMessage()]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState<Tone>("friendly");
  const [avatar, setAvatar] = useState(true);
  const [showIntent, setShowIntent] = useState(true);
  const [sourceMode, setSourceMode] = useState(true);
  const [mode, setMode] = useState<"mock" | "openai">("mock");
  const [model, setModel] = useState("mock scénář");
  const [knowledgeCount, setKnowledgeCount] = useState(887);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [desktopPreview, setDesktopPreview] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then(async (response) => await response.json() as { mode?: string; model?: string; knowledge?: { pages?: number } })
      .then((data) => {
        setMode(data.mode === "openai" ? "openai" : "mock");
        setModel(data.model || "mock scénář");
        if (data.knowledge?.pages) setKnowledgeCount(data.knowledge.pages);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const lastIntent = useMemo(
    () => [...messages].reverse().find((message) => message.intent && message.intent.id !== "unknown")?.intent,
    [messages],
  );

  function reset() {
    setMessages([initialMessage()]);
    setDraft("");
    setBusy(false);
  }

  async function sendMessage(text = draft, baseMessages = messages) {
    const clean = text.trim();
    if (!clean || busy) return;

    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", text: clean, time: timeNow() };
    const nextMessages = [...baseMessages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, text: content }) => ({ role, content })),
          tone,
        }),
      });
      const data = await response.json() as {
        error?: string; mode?: string; reply: string; intent?: Intent;
        source?: Source | null; sources?: Source[]; card?: AnswerCard | null; quickReplies?: string[];
      };
      if (!response.ok) throw new Error(data.error || "TOBi teď nemůže odpovědět.");
      setMode(data.mode === "openai" ? "openai" : "mock");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: data.reply,
          time: timeNow(),
          intent: data.intent,
          source: data.source,
          sources: data.sources,
          card: data.card,
          quickReplies: data.quickReplies,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "Něco se nepovedlo. Zkuste to prosím znovu.",
          time: timeNow(),
          quickReplies: ["Zkusit znovu", "Spojit s člověkem"],
        },
      ]);
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function startTopic(prompt: string) {
    const fresh = initialMessage();
    setMobileSidebar(false);
    void sendMessage(prompt, [fresh]);
  }

  function requestHandoff() {
    setMessages((current) => [
      ...current,
      {
        id: `handoff-${Date.now()}`,
        role: "assistant",
        text: "Rozumím. Předám operátorovi stručné shrnutí toho, co už jsme řešili, abyste vše nemusel/a opakovat. Linka péče je dostupná na *77 nebo 800 77 00 77.",
        time: timeNow(),
        quickReplies: ["Pokračovat s TOBi", "Zobrazit kontakty"],
      },
    ]);
  }

  function handleQuickReply(reply: string) {
    if (reply === "Spojit s člověkem") return requestHandoff();
    if (reply === "Pokračovat s TOBi") return;
    if (reply === "Zobrazit kontakty") {
      window.open("https://www.vodafone.cz/kontakty/", "_blank", "noopener,noreferrer");
      return;
    }
    void sendMessage(reply);
  }

  function rateMessage(id: string, feedback: "up" | "down") {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, feedback } : message));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f2f2] lg:h-screen lg:overflow-hidden">
      <header className="flex h-16 items-center justify-between border-b border-[#dedede] bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileSidebar(true)} className="grid h-10 w-10 place-items-center rounded-full border border-[#dedede] lg:hidden" aria-label="Otevřít scénáře"><Menu size={18} /></button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e60000] text-lg font-black text-white">“</div>
          <div>
            <div className="flex items-center gap-2 font-bold tracking-[-.02em]">TOBi Studio <span className="rounded-full bg-[#ffe5e5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#b00000]">next</span></div>
            <p className="hidden text-xs text-[#666] sm:block">Vodafone konverzační prototyp</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reset} className="hidden h-9 items-center gap-2 rounded-full border border-[#d4d4d4] bg-white px-4 text-sm font-semibold text-[#333] transition hover:bg-[#f5f5f5] sm:flex"><RefreshCw size={14} /> Nový test</button>
          <button type="button" className="flex h-9 items-center gap-2 rounded-full bg-[#e60000] px-4 text-sm font-bold text-white transition hover:bg-[#bd0000]"><Zap size={15} /> Uložit verzi</button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-[#d4d4d4]" aria-label="Další možnosti"><MoreHorizontal size={17} /></button>
        </div>
      </header>

      <div className="grid lg:h-[calc(100vh-64px)] lg:grid-cols-[248px_minmax(500px,1fr)_310px]">
        <aside className={`${mobileSidebar ? "fixed inset-0 z-50 block bg-black/25" : "hidden"} lg:static lg:z-auto lg:block lg:bg-transparent`} onClick={() => setMobileSidebar(false)}>
          <div className="h-full w-[290px] overflow-y-auto border-r border-[#dedede] bg-white p-4 lg:w-auto" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between px-1">
              <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#777]">Zákaznické situace</p><h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Co TOBi umí</h2></div>
              <button type="button" onClick={() => setMobileSidebar(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f2f2f2] lg:hidden" aria-label="Zavřít"><X size={18} /></button>
            </div>

            <nav className="space-y-1" aria-label="Telco témata">
              {topics.map((topic) => {
                const Icon = topic.icon;
                const active = lastIntent?.id === topic.id || (topic.id === "pin" && lastIntent?.id === "pin-puk");
                return (
                  <button key={topic.id} type="button" onClick={() => startTopic(topic.prompt)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? "bg-[#ffe7e7] text-[#b00000]" : "hover:bg-[#f5f5f5]"}`}>
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${active ? "bg-white text-[#e60000] shadow-sm" : "bg-[#f0f0f0] text-[#4a4d4e]"}`}><Icon size={17} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{topic.label}</span><span className="block truncate text-[11px] text-[#777]">{topic.detail}</span></span>
                    <ChevronRight size={15} className="text-[#999]" />
                  </button>
                );
              })}
            </nav>

            <div className="my-5 border-t border-[#e5e5e5]" />
            <div className="rounded-2xl bg-[#f3f3f3] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#333]"><BookOpenCheck size={16} className="text-[#e60000]" /> Znalosti Vodafone.cz</div>
              <p className="mt-2 text-[11px] leading-4 text-[#666]">{knowledgeCount} veřejných článků · synchronizováno 30. 10. 2026</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ddd]"><div className="h-full w-full rounded-full bg-[#e60000]" /></div>
            </div>

            <div className="mt-4 rounded-2xl bg-[#222] p-4 text-white">
              <div className="mb-3 flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><Headphones size={15} /></span><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-[#222]">handoff</span></div>
              <h3 className="text-sm font-bold">Člověk vždy nablízku</h3>
              <p className="mt-1.5 text-xs leading-5 text-white/65">TOBi předá kontext, ne jen zákazníka.</p>
              <button type="button" onClick={requestHandoff} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-white">Vyzkoušet předání <ArrowRight size={13} /></button>
            </div>
          </div>
        </aside>

        <section className="studio-grid relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden bg-[#f7f7f7] p-3 sm:p-5">
          <div className="mx-auto mb-3 flex w-full max-w-[780px] items-center justify-between">
            <div><p className="text-xs font-semibold text-[#777]">Interaktivní náhled</p><h1 className="mt-0.5 text-lg font-extrabold tracking-[-.035em] sm:text-xl">TOBi nové generace</h1></div>
            <div className="hidden rounded-full border border-[#d6d6d6] bg-white p-1 sm:flex">
              <button type="button" onClick={() => setDesktopPreview(false)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Mobil</button>
              <button type="button" onClick={() => setDesktopPreview(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Desktop</button>
            </div>
          </div>

          <div className={`mx-auto flex w-full flex-1 items-center justify-center transition-all ${desktopPreview ? "max-w-[780px]" : "max-w-[460px]"}`}>
            <div className="flex h-[min(740px,calc(100vh-132px))] min-h-[580px] w-full flex-col overflow-hidden rounded-[26px] border border-[#d7d7d7] bg-white shadow-[0_26px_70px_rgba(0,0,0,.14)]">
              <div className="bg-[#e60000] px-4 pb-4 pt-3 text-white sm:px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><TobiAvatar inverse /><div><div className="flex items-center gap-1.5 text-base font-extrabold">TOBi <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[#e60000]"><Check size={10} strokeWidth={3} /></span></div><div className="flex items-center gap-1.5 text-[11px] font-medium text-white/80"><span className="h-1.5 w-1.5 rounded-full bg-[#7deb8d]" /> AI asistent · dostupný 24/7</div></div></div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={requestHandoff} className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-[11px] font-bold transition hover:bg-white/25 sm:flex"><Headphones size={14} /> Člověk</button>
                    <button type="button" onClick={reset} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25" aria-label="Restartovat chat"><RefreshCw size={16} /></button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-[#e9e9e9] bg-white px-4 py-2.5 text-[11px] text-[#666]">
                <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#16853e]" /> Bez přihlášení · obecné rady</span>
                <a href="https://muj.vodafone.cz/" target="_blank" rel="noreferrer" className="font-bold text-[#bd0000] underline decoration-[#bd0000]/30 underline-offset-2">Přihlásit se</a>
              </div>

              <div className="chat-scrollbar flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8f8f8_0%,#fff_48%)] px-4 py-5 sm:px-5" aria-live="polite" aria-relevant="additions text">
                {messages.map((message, index) => (
                  <div key={message.id} className={`message-rise ${message.role === "user" ? "ml-auto max-w-[82%]" : "max-w-[94%]"}`}>
                    <div className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role === "assistant" && avatar && <TobiAvatar small />}
                      <div className={`${message.role === "user" ? "items-end" : "items-start"} flex min-w-0 flex-col`}>
                        {message.role === "assistant" && message.intent && showIntent && (
                          <div className="mb-1.5 flex items-center gap-1.5 rounded-full bg-[#fff0f0] px-2.5 py-1 text-[10px] font-bold text-[#b00000]"><Sparkles size={11} /> Rozumím: {message.intent.label}</div>
                        )}
                        <div className={`rounded-[19px] px-4 py-3 text-[14px] leading-[1.55] ${message.role === "user" ? "rounded-br-md bg-[#333] text-white" : "rounded-bl-md border border-[#e1e1e1] bg-white text-[#222] shadow-[0_5px_16px_rgba(0,0,0,.06)]"}`}>{message.text}</div>
                        <span className="mt-1 px-1 text-[10px] text-[#999]">{message.time}</span>
                      </div>
                    </div>

                    {message.role === "assistant" && index === 0 && messages.length === 1 && (
                      <div className={`${avatar ? "ml-[46px]" : "ml-0"} mt-3 grid grid-cols-2 gap-2`}>
                        {topics.slice(0, 4).map((topic) => {
                          const Icon = topic.icon;
                          return <button key={topic.id} type="button" onClick={() => void sendMessage(topic.prompt)} className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-[#dfdfdf] bg-white p-3 text-left transition hover:border-[#e60000] hover:shadow-sm"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[#e60000]"><Icon size={17} /></span><span className="text-xs font-bold leading-4 text-[#333]">{topic.label}</span><ChevronRight size={14} className="ml-auto text-[#aaa] transition group-hover:text-[#e60000]" /></button>;
                        })}
                      </div>
                    )}

                    {message.role === "assistant" && message.card && (
                      <div className={`${avatar ? "ml-[46px]" : "ml-0"} mt-2.5 overflow-hidden rounded-2xl border border-[#dedede] bg-white shadow-[0_8px_20px_rgba(0,0,0,.07)]`}>
                        <div className="border-b border-[#ececec] px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[.1em] text-[#e60000]">Doporučený postup</p><h3 className="mt-0.5 text-sm font-extrabold text-[#222]">{message.card.title}</h3></div>
                        <ol className="space-y-3 p-4">
                          {message.card.steps.map((step, stepIndex) => <li key={step} className="flex gap-3 text-xs leading-5 text-[#444]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f0f0f0] text-[11px] font-extrabold text-[#333]">{stepIndex + 1}</span><span className="pt-0.5">{step}</span></li>)}
                        </ol>
                        {message.card.warning && <div className="mx-4 mb-3 flex gap-2 rounded-xl bg-[#fff6df] p-3 text-[11px] leading-4 text-[#695015]"><CircleHelp size={15} className="mt-0.5 shrink-0" /> {message.card.warning}</div>}
                        {message.card.actionUrl && <div className="border-t border-[#ececec] p-3"><a href={message.card.actionUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-[#e60000] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#bd0000]">{message.card.actionLabel} <ExternalLink size={13} /></a></div>}
                      </div>
                    )}

                    {message.role === "assistant" && sourceMode && (message.sources?.length || message.source) && (
                      <div className={`${avatar ? "ml-[46px]" : "ml-0"} mt-2 overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#fafafa]`}>
                        {(message.sources?.length ? message.sources : message.source ? [message.source] : []).slice(0, 3).map((source, sourceIndex) => (
                          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 border-b border-[#e8e8e8] px-3 py-2 text-[10px] text-[#666] transition last:border-0 hover:bg-white"><BookOpenCheck size={13} className="shrink-0 text-[#16853e]" /><span className="min-w-0 flex-1 truncate"><strong>{sourceIndex === 0 ? "Ověřeno" : "Další zdroj"}:</strong> {source.title}</span><ExternalLink size={11} /></a>
                        ))}
                      </div>
                    )}

                    {message.role === "assistant" && message.quickReplies && (
                      <div className={`${avatar ? "ml-[46px]" : "ml-0"} mt-2.5 flex flex-wrap gap-2`}>
                        {message.quickReplies.slice(0, 3).map((reply) => <button key={reply} type="button" onClick={() => handleQuickReply(reply)} className="rounded-full border border-[#d3d3d3] bg-white px-3 py-2 text-[11px] font-bold text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000]">{reply}</button>)}
                      </div>
                    )}

                    {message.role === "assistant" && index > 0 && (
                      <div className={`${avatar ? "ml-[46px]" : "ml-0"} mt-2 flex items-center gap-1 text-[10px] text-[#888]`}><span className="mr-1">Pomohla odpověď?</span><button type="button" onClick={() => rateMessage(message.id, "up")} className={`grid h-7 w-7 place-items-center rounded-full ${message.feedback === "up" ? "bg-[#e1f5e7] text-[#16853e]" : "hover:bg-[#eee]"}`} aria-label="Odpověď pomohla"><ThumbsUp size={12} /></button><button type="button" onClick={() => rateMessage(message.id, "down")} className={`grid h-7 w-7 place-items-center rounded-full ${message.feedback === "down" ? "bg-[#ffe5e5] text-[#bd0000]" : "hover:bg-[#eee]"}`} aria-label="Odpověď nepomohla"><ThumbsDown size={12} /></button></div>
                    )}
                  </div>
                ))}

                {busy && <div className="message-rise flex items-end gap-2.5">{avatar && <TobiAvatar small />}<div className="flex h-11 items-center gap-1 rounded-[19px] rounded-bl-md border border-[#e1e1e1] bg-white px-4 shadow-sm" aria-label="TOBi píše">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-[#e60000]" style={{ animation: `blink 1.1s ${dot * 0.15}s infinite` }} />)}</div></div>}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSubmit} className="border-t border-[#e1e1e1] bg-white p-3 sm:p-4">
                <div className="flex items-end gap-2 rounded-[18px] border border-[#ccc] bg-white p-2 pl-4 transition focus-within:border-[#e60000] focus-within:ring-4 focus-within:ring-[#ffe5e5]">
                  <textarea ref={textareaRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Sem napište svůj dotaz…" aria-label="Zpráva pro TOBiho" className="max-h-24 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[14px] leading-5 outline-none placeholder:text-[#888]" />
                  <button type="submit" disabled={!draft.trim() || busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e60000] text-white transition hover:bg-[#bd0000] disabled:cursor-not-allowed disabled:bg-[#ef9b9b]" aria-label="Odeslat"><Send size={17} /></button>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-[#888]"><span>AI může chybovat. Důležité údaje si ověřte.</span><button type="button" onClick={requestHandoff} className="font-bold text-[#555] underline underline-offset-2">Potřebuji člověka</button></div>
              </form>
            </div>
          </div>
        </section>

        <aside className="hidden overflow-y-auto border-l border-[#dedede] bg-white p-5 lg:block">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#777]">Inspektor</p><h2 className="mt-1 text-lg font-bold tracking-[-.03em]">UX pravidla TOBiho</h2></div><Settings2 size={18} className="text-[#666]" /></div>

          <div className="space-y-5">
            <section><label className="text-xs font-bold text-[#555]">Tón komunikace</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-[#eee] p-1">{(["friendly", "brief", "formal"] as Tone[]).map((item) => <button key={item} type="button" onClick={() => setTone(item)} className={`rounded-full py-2 text-[10px] font-bold transition ${tone === item ? "bg-white text-[#bd0000] shadow-sm" : "text-[#777]"}`}>{item === "friendly" ? "Lidský" : item === "brief" ? "Stručný" : "Formální"}</button>)}</div></section>

            <section className="rounded-2xl border border-[#e1e1e1] p-4">
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Zobrazit avatar</div><Toggle checked={avatar} onChange={() => setAvatar((value) => !value)} label="Zobrazit avatar" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Potvrdit záměr</div><Toggle checked={showIntent} onChange={() => setShowIntent((value) => !value)} label="Potvrdit záměr" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Ukázat zdroj</div><Toggle checked={sourceMode} onChange={() => setSourceMode((value) => !value)} label="Ukázat zdroj" /></div>
            </section>

            <section><div className="mb-2 flex items-center justify-between"><label className="text-xs font-bold text-[#555]">Znalostní báze</label><span className="flex items-center gap-1 text-[10px] font-bold text-[#16853e]"><span className="h-1.5 w-1.5 rounded-full bg-[#16853e]" /> {knowledgeCount} článků</span></div><div className="overflow-hidden rounded-2xl border border-[#e1e1e1]">{knowledgeAreas.map((source) => <div key={source} className="flex items-center gap-2 border-b border-[#eee] px-3 py-2.5 last:border-0"><FileText size={13} className="text-[#e60000]" /><span className="flex-1 text-[11px] font-semibold text-[#555]">{source}</span><Check size={12} className="text-[#16853e]" /></div>)}</div></section>

            <section className="rounded-2xl bg-[#f3f3f3] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-extrabold text-[#333]"><Database size={14} className="text-[#e60000]" /> {mode === "openai" ? "OpenAI aktivní" : "Vyhledávací režim"}</div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-[#555]">{mode}</span></div><p className="mt-2 text-[11px] leading-4 text-[#666]">Model: {model}. Dotaz se vyhledává napříč {knowledgeCount} články a odpověď ukazuje použité zdroje.</p></section>

            <section className="rounded-2xl border border-[#ffc9c9] bg-[#fff5f5] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#a00000]"><WifiOff size={14} /> Ochrana proti slepé uličce</div><p className="mt-2 text-[11px] leading-4 text-[#6b4a4a]">Po 2 nepochopeních nabídnout konkrétní témata nebo předání operátorovi.</p></section>

            <button type="button" onClick={requestHandoff} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#ccc] py-2.5 text-xs font-bold text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000]"><MessageCircleMore size={14} /> Otestovat handoff</button>
          </div>
        </aside>
      </div>
    </main>
  );
}
