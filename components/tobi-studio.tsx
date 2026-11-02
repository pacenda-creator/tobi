"use client";

import {
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Headphones,
  LockKeyhole,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Router,
  Send,
  Settings2,
  Signal,
  SquarePen,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  WalletCards,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ChatBlockRenderer } from "@/components/tobi/chat-block-renderer";
import { CapabilityCarousel } from "@/components/tobi/capability-carousel";
import { IncidentCard } from "@/components/tobi/incident-card";
import { IntroTopics } from "@/components/tobi/intro-topics";
import { chatRequestV1Schema, chatResponseV1Schema, salvageChatResponseTextV1, type ChatRequestV1, type ChatResponseV1, type QuickReplyV1 } from "@/lib/contracts/chat/v1";
import { defaultDemoRuntimeState, defaultTobiConfig, demoMajorIncident, type OperatorAvailability } from "@/lib/tobi-config";

type Tone = NonNullable<ChatRequestV1["preferences"]>["tone"];
type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
  requestText?: string;
  time: string;
  response?: ChatResponseV1;
  feedback?: "up" | "down";
};
type PrototypeAnalyticsEvent = { type: "task_resolution" | "answer_helpfulness"; value: "yes" | "no"; at: string };

const topicIcons = { router: Router, "qr-code": QrCode, "wallet-cards": WalletCards, globe: Globe2, lock: LockKeyhole, signal: Signal };

function timeNow() {
  return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initialMessage(): Message {
  return {
    id: `welcome-${Date.now()}`,
    role: "assistant",
    text: defaultTobiConfig.copy.welcome,
    time: timeNow(),
  };
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[#e60000]" : "bg-[#d1d1d1]"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function CustomerPagePreview({ chatOpen }: { chatOpen: boolean }) {
  return (
    <div data-chat-open={chatOpen} className="tobi-customer-background min-h-[100dvh] bg-[#f7f7f7] text-[#222]">
      <header className="border-b border-[#dedede] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e60000] text-lg font-black text-white">“</span><span className="font-bold">Vodafone</span></div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#555] sm:flex" aria-label="Ukázková navigace"><a href="#sluzby" className="hover:text-[#bd0000]">Služby</a><a href="#pece" className="hover:text-[#bd0000]">Péče</a><a href="#ucet" className="hover:text-[#bd0000]">Můj Vodafone</a></nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.35fr_.65fr] lg:py-16">
        <section id="pece" className="rounded-[28px] bg-white p-7 shadow-sm sm:p-10"><p className="text-sm font-bold text-[#bd0000]">Centrum péče</p><h1 className="mt-3 max-w-xl text-3xl font-extrabold tracking-[-.04em] sm:text-5xl">S čím vám dnes můžeme pomoci?</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[#666]">Najděte rychle odpověď, spravujte své služby nebo se zeptejte TOBiho. Obsah stránky zůstává dostupný i při otevřeném chatu.</p><div className="mt-7 flex flex-wrap gap-3"><a href="#sluzby" className="inline-flex min-h-11 items-center rounded-full bg-[#e60000] px-5 text-sm font-bold text-white hover:bg-[#bd0000]">Spravovat služby</a><a href="#napoveda" className="inline-flex min-h-11 items-center rounded-full border border-[#ccc] px-5 text-sm font-bold hover:bg-[#f5f5f5]">Projít nápovědu</a></div></section>
        <aside id="sluzby" className="grid content-start gap-3"><div className="rounded-2xl border border-[#e2e2e2] bg-white p-5"><p className="text-sm font-bold">Internet a Wi‑Fi</p><p className="mt-1 text-sm leading-5 text-[#666]">Nastavení, výpadky a rychlost připojení.</p></div><div className="rounded-2xl border border-[#e2e2e2] bg-white p-5"><p className="text-sm font-bold">Vyúčtování</p><p className="mt-1 text-sm leading-5 text-[#666]">Platby, faktury a vysvětlení částek.</p></div></aside>
      </div>
    </div>
  );
}

export default function TobiStudio({ customerOnly = false }: { customerOnly?: boolean }) {
  const [config, setConfig] = useState(defaultTobiConfig);
  const [runtime, setRuntime] = useState(defaultDemoRuntimeState);
  const [messages, setMessages] = useState<Message[]>([initialMessage()]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState<Tone>("friendly");
  const [operatorPanelOpen, setOperatorPanelOpen] = useState(false);
  const [chatClosed, setChatClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [incidentDismissed, setIncidentDismissed] = useState(false);
  const [incidentClock, setIncidentClock] = useState(() => Date.now());
  const [analyticsEvents, setAnalyticsEvents] = useState<PrototypeAnalyticsEvent[]>([]);
  const [hasNewResponse, setHasNewResponse] = useState(false);
  const [lastFailedRequest, setLastFailedRequest] = useState<{ text: string; baseMessages: Message[]; displayText?: string } | null>(null);
  const [mode, setMode] = useState<"mock" | "openai">("mock");
  const [model, setModel] = useState("mock scénář");
  const [knowledgeCount, setKnowledgeCount] = useState(887);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [desktopPreview, setDesktopPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const operatorButtonRef = useRef<HTMLButtonElement>(null);
  const wasClosedRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const lastAssistantIdRef = useRef(messages[0].id);
  const shouldFollowResponseRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const topics = config.topics;
  const knowledgeAreas = config.knowledgeAreas;

  const operatorCopy = runtime.operatorAvailability === "online"
    ? config.copy.operatorOnline
    : runtime.operatorAvailability === "offline"
      ? config.copy.operatorOffline
      : config.copy.operatorUnknown;
  const operatorAccessibleCopy = runtime.operatorAvailability === "unknown" ? operatorCopy : `Ukázkový stav: ${operatorCopy.toLocaleLowerCase("cs")}`;
  const incident = runtime.activeIncident;
  const incidentNotExpired = !incident?.expiresAt || Date.parse(incident.expiresAt) > incidentClock;
  const incidentTargeted = incident?.targeting !== "known-location" || runtime.incidentMatch === "matched";
  const incidentServiceSupported = Boolean(incident && config.features.majorIncidentServices.includes(incident.service));
  const incidentSourceTrusted = Boolean(incident && ["demo", "verified-feed", "manual"].includes(incident.source.kind));
  const showMajorIncident = Boolean(config.features.majorIncident && incident && incident.status === "active" && incidentNotExpired && incidentTargeted && incidentServiceSupported && incidentSourceTrusted && runtime.incidentMatch !== "not-matched" && !incidentDismissed);
  const incidentDemoMode = !incident ? "none" : runtime.incidentMatch === "not-matched" ? "irrelevant" : !incidentNotExpired ? "expired" : incident.status === "resolved" ? "resolved" : incident.scope === "local" ? "local" : "broad";

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
    if (!customerOnly) return;
    const scenario = new URLSearchParams(window.location.search).get("scenario");
    if (!scenario?.startsWith("incident")) return;
    const frame = requestAnimationFrame(() => setRuntime((current) => ({
        ...current,
        activeIncident: {
          ...demoMajorIncident,
          scope: scenario === "incident-local" || scenario === "incident-irrelevant" ? "local" : "global",
          targeting: scenario === "incident-local" || scenario === "incident-irrelevant" ? "known-location" : "unknown-location",
          status: scenario === "incident-resolved" ? "resolved" : "active",
          expiresAt: scenario === "incident-expired" ? "2020-01-01T00:00:00Z" : demoMajorIncident.expiresAt,
        },
        incidentMatch: scenario === "incident-local" ? "matched" : scenario === "incident-irrelevant" ? "not-matched" : "unknown",
      })));
    return () => cancelAnimationFrame(frame);
  }, [customerOnly]);

  useEffect(() => {
    if (!incident?.expiresAt) return;
    const delay = Date.parse(incident.expiresAt) - Date.now();
    if (delay <= 0) {
      const expiredTimer = window.setTimeout(() => setIncidentClock(Date.now()), 0);
      return () => window.clearTimeout(expiredTimer);
    }
    const timer = window.setInterval(() => setIncidentClock(Date.now()), Math.min(Math.max(delay, 1_000), 60_000));
    return () => window.clearInterval(timer);
  }, [incident?.expiresAt]);

  useEffect(() => {
    if (chatClosed) {
      wasClosedRef.current = true;
      const frame = requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    if (!wasClosedRef.current) return;
    wasClosedRef.current = false;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [chatClosed]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [draft]);

  useEffect(() => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latestAssistant || latestAssistant.id === lastAssistantIdRef.current) return;
    lastAssistantIdRef.current = latestAssistant.id;

    if (chatClosed) {
      const frame = requestAnimationFrame(() => setHasNewResponse(true));
      return () => cancelAnimationFrame(frame);
    }

    requestAnimationFrame(() => {
      if (shouldFollowResponseRef.current) {
        const scroller = chatScrollRef.current;
        const message = messageRefs.current.get(latestAssistant.id);
        if (scroller && message) {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          scroller.scrollTo({ top: Math.max(0, message.offsetTop - 20), behavior: reduceMotion ? "auto" : "smooth" });
        }
        setHasNewResponse(false);
      } else {
        setHasNewResponse(true);
      }
    });
  }, [chatClosed, messages]);

  const lastIntent = useMemo(
    () => [...messages].reverse().find((message) => message.response && message.response.intent.id !== "unknown")?.response?.intent,
    [messages],
  );

  function reset() {
    requestGenerationRef.current += 1;
    const fresh = initialMessage();
    setMessages([fresh]);
    lastAssistantIdRef.current = fresh.id;
    setDraft("");
    setBusy(false);
    setHasNewResponse(false);
    setLastFailedRequest(null);
    setOperatorPanelOpen(false);
    setChatClosed(false);
    setIncidentDismissed(false);
  }

  async function sendMessage(text = draft, baseMessages = messages, displayText?: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const scroller = chatScrollRef.current;
    shouldFollowResponseRef.current = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;

    const userMessage: Message = { id: uniqueId("user"), role: "user", text: displayText || clean, requestText: displayText ? clean : undefined, time: timeNow() };
    const nextMessages = [...baseMessages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    const requestGeneration = requestGenerationRef.current;
    let rawResponsePayload: unknown = null;

    try {
      const requestPayload: ChatRequestV1 = chatRequestV1Schema.parse({
        contractVersion: "1",
        requestId: uniqueId("req"),
        messages: nextMessages.slice(-12).map(({ role, text, requestText }) => ({ role, content: requestText || text })),
        context: { locale: "cs-CZ", channel: "web" },
        preferences: { tone },
      });
      const response = await fetch("/api/chat/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      rawResponsePayload = await response.json().catch(() => null);
      if (requestGeneration !== requestGenerationRef.current) return;
      const parsedResponse = chatResponseV1Schema.safeParse(rawResponsePayload);
      if (!parsedResponse.success) throw new Error("invalid_chat_response");
      const data = parsedResponse.data;
      setLastFailedRequest(data.mode === "fallback" && data.fallback.retryable ? { text: clean, baseMessages, displayText } : null);
      setMessages((current) => [
        ...current,
        {
          id: uniqueId("assistant"),
          role: "assistant",
          text: data.text,
          time: timeNow(),
          response: data,
        },
      ]);
    } catch {
      if (requestGeneration !== requestGenerationRef.current) return;
      const salvagedText = salvageChatResponseTextV1(rawResponsePayload);
      const fallback = chatResponseV1Schema.parse({
        contractVersion: "1",
        responseId: uniqueId("local"),
        mode: "fallback",
        text: salvagedText || "Něco se nepovedlo. Zkuste to prosím znovu.",
        blocks: [],
        quickReplies: [],
        sources: [],
        intent: { id: "unknown", label: "Potřebuji upřesnit", confidence: 0 },
        fallback: { code: salvagedText ? "invalid_generation" : "upstream_unavailable", retryable: true },
      });
      setLastFailedRequest({ text: clean, baseMessages, displayText });
      setMessages((current) => [
        ...current,
        {
          id: uniqueId("error"),
          role: "assistant",
          text: fallback.text,
          time: timeNow(),
          response: fallback,
        },
      ]);
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setBusy(false);
      }
    }
  }

  function startTopic(prompt: string) {
    const fresh = initialMessage();
    setMobileSidebar(false);
    void sendMessage(prompt, [fresh]);
  }

  function requestHandoff() {
    setOperatorPanelOpen((open) => !open);
  }

  function handleQuickReply(reply: QuickReplyV1) {
    if (busy) return;
    if (reply.id === "internet-resolved" || reply.id === "internet-not-resolved") setAnalyticsEvents((events) => [...events, { type: "task_resolution", value: reply.id === "internet-resolved" ? "yes" : "no", at: new Date().toISOString() }]);
    if (reply.id === "internet-resolved") {
      const scroller = chatScrollRef.current;
      shouldFollowResponseRef.current = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
      setMessages((current) => [
        ...current,
        { id: uniqueId("user"), role: "user", text: reply.label, requestText: reply.action.message, time: timeNow() },
        { id: uniqueId("assistant"), role: "assistant", text: "Skvělé, internet už funguje. S čím dalším vám pomůžu?", time: timeNow() },
      ]);
      return;
    }
    void sendMessage(reply.action.message, messages, reply.label);
  }

  function retryLastRequest() {
    if (!lastFailedRequest || busy) return;
    void sendMessage(lastFailedRequest.text, lastFailedRequest.baseMessages, lastFailedRequest.displayText);
  }

  function selectIntroTopic(prompt: string) {
    void sendMessage(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }

  function handleChatScroll() {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
    if (busy) shouldFollowResponseRef.current = nearBottom;
  }

  function revealLatestResponse() {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latestAssistant) return;
    const scroller = chatScrollRef.current;
    const message = messageRefs.current.get(latestAssistant.id);
    if (scroller && message) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: Math.max(0, message.offsetTop - 20), behavior: reduceMotion ? "auto" : "smooth" });
    }
    setHasNewResponse(false);
  }

  function rateMessage(id: string, feedback: "up" | "down") {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, feedback } : message));
    setAnalyticsEvents((events) => [...events, { type: "answer_helpfulness", value: feedback === "up" ? "yes" : "no", at: new Date().toISOString() }]);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function onWidgetKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    if (operatorPanelOpen) {
      event.stopPropagation();
      setOperatorPanelOpen(false);
      requestAnimationFrame(() => operatorButtonRef.current?.focus({ preventScroll: true }));
      return;
    }
    if (customerOnly) {
      event.stopPropagation();
      setChatClosed(true);
    }
  }

  return (
    <main className={customerOnly ? "min-h-[100dvh] bg-[#f2f2f2]" : "min-h-screen bg-[#f2f2f2] lg:h-screen lg:overflow-hidden"}>
      {customerOnly ? <CustomerPagePreview chatOpen={!chatClosed} /> : null}
      {!customerOnly ? <header className="flex h-16 items-center justify-between border-b border-[#dedede] bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileSidebar(true)} className="grid h-10 w-10 place-items-center rounded-full border border-[#dedede] lg:hidden" aria-label="Otevřít scénáře"><Menu size={18} /></button>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e60000] text-lg font-black text-white">“</div>
          <div>
            <div className="flex items-center gap-2 font-bold tracking-[-.02em]">TOBi Studio <span className="rounded-full bg-[#ffe5e5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#b00000]">next</span></div>
            <p className="hidden text-xs text-[#666] sm:block">Vodafone konverzační prototyp</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={reset} className="hidden h-9 items-center gap-2 rounded-full border border-[#d4d4d4] bg-white px-4 text-sm font-semibold text-[#333] transition hover:bg-[#f5f5f5] sm:flex"><RefreshCw size={14} /> Nový test</button>
          <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#e60000] text-sm font-bold text-white transition hover:bg-[#bd0000] sm:w-auto sm:px-4" aria-label="Uložit verzi"><Zap size={15} /><span className="hidden sm:inline">Uložit verzi</span></button>
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#d4d4d4]" aria-label="Další možnosti"><MoreHorizontal size={17} /></button>
        </div>
      </header> : null}

      <div className={customerOnly ? "tobi-customer-layer" : "grid lg:h-[calc(100vh-64px)] lg:grid-cols-[248px_minmax(500px,1fr)_310px]"}>
        {!customerOnly ? <aside className={`${mobileSidebar ? "fixed inset-0 z-50 block bg-black/25" : "hidden"} lg:static lg:z-auto lg:block lg:bg-transparent`} onClick={() => setMobileSidebar(false)}>
          <div className="h-full w-[290px] overflow-y-auto border-r border-[#dedede] bg-white p-4 lg:w-auto" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between px-1">
              <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#777]">Zákaznické situace</p><h2 className="mt-1 text-lg font-bold tracking-[-.03em]">Co TOBi umí</h2></div>
              <button type="button" onClick={() => setMobileSidebar(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f2f2f2] lg:hidden" aria-label="Zavřít"><X size={18} /></button>
            </div>

            <nav className="space-y-1" aria-label="Telco témata">
              {topics.map((topic) => {
                const Icon = topicIcons[topic.icon as keyof typeof topicIcons] || CircleHelp;
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

          </div>
        </aside> : null}

        <section className={customerOnly ? "h-full pointer-events-none" : "studio-grid relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden bg-[#f7f7f7] p-3 sm:p-5"}>
          {!customerOnly ? <div className="mx-auto mb-3 flex w-full max-w-[780px] items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-[#777]">Interaktivní náhled</p><h1 className="mt-0.5 text-lg font-extrabold tracking-[-.035em] sm:text-xl">TOBi nové generace</h1></div>
            <div className="hidden items-center gap-2 sm:flex">
              <a href="/chat" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d6d6d6] bg-white px-4 text-xs font-bold text-[#333] hover:bg-[#f5f5f5]">Zákaznický náhled <ExternalLink size={13} /></a>
              <div className="flex rounded-full border border-[#d6d6d6] bg-white p-1">
                <button type="button" onClick={() => setDesktopPreview(false)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Mobil</button>
                <button type="button" onClick={() => setDesktopPreview(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Desktop</button>
              </div>
            </div>
          </div> : null}

          <div data-expanded={customerOnly ? expanded : undefined} className={customerOnly ? "tobi-widget-shell" : `mx-auto flex min-h-0 w-full flex-1 transition-all ${chatClosed ? "items-end justify-end pb-4" : "items-center justify-center"} ${desktopPreview ? "max-w-[560px]" : "max-w-[460px]"}`}>
              <button
                ref={launcherRef}
                hidden={!chatClosed}
                type="button"
                onClick={() => setChatClosed(false)}
                aria-controls="tobi-widget-panel"
                aria-expanded={!chatClosed}
                aria-label={hasNewResponse ? "Otevřít chat s TOBim. Nová odpověď." : "Otevřít chat s TOBim"}
                className="tobi-widget-launcher relative flex min-h-16 items-center gap-3 rounded-full border border-[#dedede] bg-white px-5 text-left shadow-[0_16px_42px_rgba(0,0,0,.14)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_52px_rgba(0,0,0,.17)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff0f0] text-[#e60000]" aria-hidden="true"><Sparkles size={21} fill="currentColor" /></span>
                <span><span className="block text-sm font-extrabold text-[#222]">Zeptat se TOBiho</span><span className="block text-[11px] text-[#777]">AI asistent</span></span>
                {hasNewResponse ? <span className="absolute right-3 top-2 h-3 w-3 rounded-full border-2 border-white bg-[#e60000]" aria-hidden="true" /> : null}
              </button>
            <div
              id="tobi-widget-panel"
              hidden={chatClosed}
              role="region"
              aria-labelledby="tobi-widget-title"
              onKeyDown={onWidgetKeyDown}
              className={`min-h-0 w-full flex-col overflow-hidden bg-white ${chatClosed ? "hidden" : "flex"} ${customerOnly ? "tobi-widget-panel rounded-[20px] border border-[#d7d7d7] shadow-[0_22px_60px_rgba(0,0,0,.16)] max-md:rounded-none max-md:border-0 max-md:shadow-none" : "h-[min(740px,calc(100vh-132px))] rounded-[26px] border border-[#d7d7d7] shadow-[0_26px_70px_rgba(0,0,0,.14)]"}`}
            >
              <header className="relative shrink-0 border-b border-[#e9e9e9] bg-white px-2 py-2 min-[360px]:px-3 sm:px-4">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex shrink-0 items-center gap-1 min-[360px]:gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center text-[#e60000] min-[360px]:h-10 min-[360px]:w-10 min-[360px]:rounded-full min-[360px]:bg-[#fff0f0]" aria-hidden="true"><Sparkles size={20} fill="currentColor" /></span>
                    <div id="tobi-widget-title" className="shrink-0 whitespace-nowrap text-[length:var(--tobi-font-title)] font-bold leading-6 text-[#222]">{config.brand.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0 min-[360px]:gap-1">
                    <button ref={operatorButtonRef} type="button" onClick={requestHandoff} aria-expanded={operatorPanelOpen} aria-label={`Pomoc operátora. ${operatorAccessibleCopy}`} title={operatorAccessibleCopy} className="relative grid h-11 w-11 place-items-center rounded-full border border-[#dedede] text-[#444] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]">
                      <Headphones size={18} aria-hidden="true" />
                      <span className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 ${runtime.operatorAvailability === "online" ? "border-white bg-[#16853e]" : runtime.operatorAvailability === "offline" ? "border-white bg-[#777]" : "border-[#777] bg-white"}`} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={reset} title="Nový chat" className="grid h-11 w-11 place-items-center rounded-full border border-[#dedede] text-[#444] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]" aria-label="Nový chat"><SquarePen size={18} aria-hidden="true" /></button>
                    {customerOnly ? <button type="button" onClick={() => setExpanded((current) => !current)} title={expanded ? "Zmenšit chat" : "Rozšířit chat"} className="hidden h-11 w-11 place-items-center rounded-full border border-[#dedede] text-[#444] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] md:grid" aria-label={expanded ? "Zmenšit chat" : "Rozšířit chat"} aria-pressed={expanded}>{expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}</button> : null}
                    <button type="button" onClick={() => { setChatClosed(true); setOperatorPanelOpen(false); }} title="Zavřít chat" className="grid h-11 w-11 place-items-center rounded-full border border-[#dedede] text-[#444] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]" aria-label="Zavřít chat"><X size={18} aria-hidden="true" /></button>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-4 text-[#666]">{config.brand.disclaimer}</p>

                {operatorPanelOpen && (
                  <section className="absolute right-3 top-[72px] z-20 w-[min(300px,calc(100%-24px))] rounded-2xl border border-[#dedede] bg-white p-4 shadow-xl" aria-label="Dostupnost operátora">
                    <p className="flex items-center gap-2 text-sm font-bold text-[#222]"><span className={`h-2.5 w-2.5 rounded-full ${runtime.operatorAvailability === "online" ? "bg-[#16853e]" : runtime.operatorAvailability === "offline" ? "bg-[#777]" : "border border-[#777] bg-white"}`} />{operatorAccessibleCopy}</p>
                    <p className="mt-1 text-xs leading-5 text-[#666]">Jde o stav prototypu. Přepojení na operátora v této iteraci ještě není zapojené.</p>
                  </section>
                )}
              </header>

              <div className="relative min-h-0 flex-1">
                <div aria-live="polite" className="sr-only">{!busy && messages.at(-1)?.role === "assistant" ? messages.at(-1)?.text : ""}</div>
                <div ref={chatScrollRef} onScroll={handleChatScroll} className={`chat-scrollbar h-full overflow-y-auto bg-white ${customerOnly ? "space-y-5 px-4 py-5 md:space-y-3 md:py-3" : "space-y-5 px-4 py-5 sm:px-5"}`}>
                  {messages.map((message, index) => {
                    const response = message.response;
                    const hasStructuredContent = response?.blocks.some((block) => block.type !== "sourceList") || false;
                    return (
                    <article
                      key={message.id}
                      ref={(node) => { if (node) messageRefs.current.set(message.id, node); else messageRefs.current.delete(message.id); }}
                      className={`message-rise scroll-mt-5 ${message.role === "user" ? "ml-auto max-w-[82%]" : "max-w-full"}`}
                    >
                      {message.role === "user" ? (
                        <div className="flex flex-col items-end">
                          <div className="rounded-[var(--tobi-radius-bubble)] rounded-br-md bg-[#f0f0ee] px-4 py-3 text-[length:var(--tobi-font-message)] leading-[var(--tobi-line-message)] text-[#222]">{message.text}</div>
                          {config.features.timestamps ? <span className="mt-1 px-1 text-[10px] text-[#999]">{message.time}</span> : null}
                        </div>
                      ) : (
                        <>
                          {!(index === 0 && messages.length === 1 && showMajorIncident) ? index === 0 && messages.length === 1 ? <h2 className="max-w-[65ch] text-xl font-bold leading-[26px] text-[#222]">{message.text}</h2> : <p className={`text-[length:var(--tobi-font-message)] leading-[var(--tobi-line-message)] text-[#333] ${hasStructuredContent ? "max-w-[65ch]" : "rounded-[var(--tobi-radius-bubble)] border border-[#e5e5e5] bg-[#fafafa] px-4 py-3"}`}>{message.text}</p> : null}
                          {config.features.timestamps ? <span className="mt-1 block text-[10px] text-[#999]">{message.time}</span> : null}

                          {index === 0 && messages.length === 1 && (showMajorIncident && incident ? <div className="mt-1"><IncidentCard incident={incident} onOtherTopic={() => setIncidentDismissed(true)} /></div> : <div className="mt-3 md:mt-2">{config.presentation.intro.renderMode === "carousel" ? <CapabilityCarousel items={config.introUseCases} onSelect={selectIntroTopic} wideBreakpoint={config.presentation.carousel.wideBreakpoint} /> : <IntroTopics items={config.introUseCases} initialVisibleCount={config.presentation.intro.initialVisibleCount} onSelect={selectIntroTopic} />}<p className="mt-3 text-sm leading-5 text-[#666] md:mt-2">Nebo mi napište vlastní dotaz.</p></div>)}

                          {response ? <ChatBlockRenderer
                            response={response}
                            preferMedia={config.features.mediaCards}
                            showPresetSources={config.features.sources}
                            renderMode={config.presentation.renderMode}
                            loop={config.presentation.carousel.loop}
                            wideBreakpoint={config.presentation.carousel.wideBreakpoint}
                            busy={busy}
                            onSendMessage={(text, label) => void sendMessage(text, messages, label)}
                          /> : null}

                          {!!response?.quickReplies.length && (
                            <div>
                            {response.intent.id === "internet" ? <p className="mt-4 text-sm font-semibold text-[#444]">Funguje už připojení?</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {response.quickReplies.slice(0, 2).map((reply) => <button key={reply.id} type="button" disabled={busy} onClick={() => handleQuickReply(reply)} className="min-h-11 rounded-full border border-[#d3d3d3] bg-white px-4 py-2 text-sm font-semibold leading-5 text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000] disabled:cursor-not-allowed disabled:opacity-50">{reply.label}</button>)}
                            </div>
                            </div>
                          )}

                          {response?.mode === "fallback" && response.fallback.retryable && lastFailedRequest && message.id === messages.at(-1)?.id ? <div className="mt-3"><button type="button" disabled={busy} onClick={retryLastRequest} className="min-h-11 rounded-full border border-[#d3d3d3] bg-white px-4 py-2 text-sm font-semibold leading-5 text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000] disabled:cursor-not-allowed disabled:opacity-50">Zkusit znovu</button></div> : null}

                          {config.features.feedback && index > 0 && response?.intent.id !== "internet" && (
                            <div className="mt-3 flex items-center gap-1 text-xs text-[#777]"><span className="mr-1">Byla tato odpověď užitečná?</span><button type="button" onClick={() => rateMessage(message.id, "up")} className={`grid h-11 w-11 place-items-center rounded-full ${message.feedback === "up" ? "bg-[#e1f5e7] text-[#16853e]" : "hover:bg-[#eee]"}`} aria-label="Odpověď byla užitečná"><ThumbsUp size={15} /></button><button type="button" onClick={() => rateMessage(message.id, "down")} className={`grid h-11 w-11 place-items-center rounded-full ${message.feedback === "down" ? "bg-[#ffe5e5] text-[#bd0000]" : "hover:bg-[#eee]"}`} aria-label="Odpověď nebyla užitečná"><ThumbsDown size={15} /></button></div>
                          )}
                        </>
                      )}
                    </article>
                    );
                  })}

                  {busy && <div className="message-rise flex items-center gap-2 text-xs text-[#666]" role="status"><span>TOBi připravuje odpověď</span><span className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-[#e60000]" style={{ animation: `blink 1.1s ${dot * 0.15}s infinite` }} />)}</span></div>}
                </div>
                {hasNewResponse && <button type="button" onClick={revealLatestResponse} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[#d7d7d7] bg-white px-4 py-2 text-xs font-bold text-[#333] shadow-lg">Nová odpověď ↓</button>}
              </div>

              <form onSubmit={onSubmit} className={`shrink-0 border-t border-[#e1e1e1] bg-white ${customerOnly ? "p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" : "p-3 sm:p-4"}`}>
                <div className="flex min-h-14 items-end gap-2 rounded-[18px] border border-[#ccc] bg-white p-2 pl-4 transition focus-within:border-[#e60000] focus-within:ring-4 focus-within:ring-[#ffe5e5]">
                  <textarea ref={textareaRef} rows={1} maxLength={4_000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Napište zprávu…" aria-label="Zpráva pro TOBiho" className={`max-h-24 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 leading-5 outline-none placeholder:text-[#888] ${customerOnly ? "text-base" : "text-[14px]"}`} />
                  <button type="submit" disabled={!draft.trim() || busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e60000] text-white transition hover:bg-[#bd0000] disabled:cursor-not-allowed disabled:bg-[#ef9b9b]" aria-label="Odeslat"><Send size={17} /></button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {!customerOnly ? <aside className="hidden overflow-y-auto border-l border-[#dedede] bg-white p-5 lg:block">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#777]">Interní prototyp</p><h2 className="mt-1 text-lg font-bold tracking-[-.03em]">TOBi Settings</h2></div><Settings2 size={18} className="text-[#666]" /></div>

          <div className="space-y-5">
            <section><label className="text-xs font-bold text-[#555]">Tón komunikace</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-[#eee] p-1">{(["friendly", "brief", "formal"] as Tone[]).map((item) => <button key={item} type="button" onClick={() => setTone(item)} className={`rounded-full py-2 text-[10px] font-bold transition ${tone === item ? "bg-white text-[#bd0000] shadow-sm" : "text-[#777]"}`}>{item === "friendly" ? "Lidský" : item === "brief" ? "Stručný" : "Formální"}</button>)}</div></section>

            <section className="rounded-2xl border border-[#e1e1e1] p-4">
              <div className="py-1"><div className="text-xs font-bold">Dostupnost operátora</div><div className="mt-0.5 text-[10px] text-[#777]">Pouze ukázkový stav prototypu</div><div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#eee] p-1">{(["unknown", "online", "offline"] as OperatorAvailability[]).map((state) => <button key={state} type="button" onClick={() => setRuntime((value) => ({ ...value, operatorAvailability: state }))} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${runtime.operatorAvailability === state ? "bg-white shadow-sm" : "text-[#666]"}`}>{state === "unknown" ? "Neznámá" : state === "online" ? "Dostupný" : "Nedostupný"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Major Incident Mode</div><div className="mt-0.5 text-[10px] text-[#777]">Bez napojení na produkční incident feed</div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1">{(["none", "local", "broad", "resolved", "irrelevant", "expired"] as const).map((state) => <button key={state} type="button" onClick={() => { setIncidentDismissed(false); setRuntime((value) => ({ ...value, activeIncident: state === "none" ? null : { ...demoMajorIncident, scope: state === "local" || state === "irrelevant" ? "local" : "global", targeting: state === "local" || state === "irrelevant" ? "known-location" : "unknown-location", status: state === "resolved" ? "resolved" : "active", expiresAt: state === "expired" ? "2020-01-01T00:00:00Z" : demoMajorIncident.expiresAt }, incidentMatch: state === "local" ? "matched" : state === "irrelevant" ? "not-matched" : "unknown" })); }} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${incidentDemoMode === state ? "bg-white shadow-sm" : "text-[#666]"}`}>{state === "none" ? "Vypnuto" : state === "local" ? "Lokální" : state === "broad" ? "Rozsáhlý" : state === "resolved" ? "Vyřešený" : state === "irrelevant" ? "Mimo oblast" : "Expirovaný"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Ukázat zdroje</div><Toggle checked={config.features.sources} onChange={() => setConfig((value) => ({ ...value, features: { ...value.features, sources: !value.features.sources } }))} label="Ukázat zdroje" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Ukázat časy</div><Toggle checked={config.features.timestamps} onChange={() => setConfig((value) => ({ ...value, features: { ...value.features, timestamps: !value.features.timestamps } }))} label="Ukázat časy zpráv" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Prezentace kroků</div><div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#eee] p-1">{(["carousel", "cards", "list"] as const).map((renderMode) => <button key={renderMode} type="button" onClick={() => setConfig((value) => ({ ...value, presentation: { ...value.presentation, renderMode } }))} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${config.presentation.renderMode === renderMode ? "bg-white shadow-sm" : "text-[#666]"}`}>{renderMode === "carousel" ? "Carousel" : renderMode === "cards" ? "Karty" : "Seznam"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Úvodní témata</div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1">{(["compact", "carousel"] as const).map((renderMode) => <button key={renderMode} type="button" onClick={() => setConfig((value) => ({ ...value, presentation: { ...value.presentation, intro: { ...value.presentation.intro, renderMode } } }))} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${config.presentation.intro.renderMode === renderMode ? "bg-white shadow-sm" : "text-[#666]"}`}>{renderMode === "compact" ? "Seznam" : "Carousel"}</button>)}</div></div>
            </section>

            <section><div className="mb-2 flex items-center justify-between"><label className="text-xs font-bold text-[#555]">Znalostní báze</label><span className="flex items-center gap-1 text-[10px] font-bold text-[#16853e]"><span className="h-1.5 w-1.5 rounded-full bg-[#16853e]" /> {knowledgeCount} článků</span></div><div className="overflow-hidden rounded-2xl border border-[#e1e1e1]">{knowledgeAreas.map((source) => <div key={source} className="flex items-center gap-2 border-b border-[#eee] px-3 py-2.5 last:border-0"><FileText size={13} className="text-[#e60000]" /><span className="flex-1 text-[11px] font-semibold text-[#555]">{source}</span><Check size={12} className="text-[#16853e]" /></div>)}</div></section>

            <section className="rounded-2xl bg-[#f3f3f3] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-extrabold text-[#333]"><Database size={14} className="text-[#e60000]" /> {mode === "openai" ? "OpenAI aktivní" : "Vyhledávací režim"}</div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-[#555]">{mode}</span></div><p className="mt-2 text-[11px] leading-4 text-[#666]">Model: {model}. Dotaz se vyhledává napříč {knowledgeCount} články a odpověď ukazuje použité zdroje.</p><p className="mt-2 text-[10px] text-[#777]">Feedback: {analyticsEvents.length} lokálních demo událostí, bez produkční analytiky.</p></section>

            <section className="rounded-2xl border border-[#ffc9c9] bg-[#fff5f5] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#a00000]"><WifiOff size={14} /> Ochrana proti slepé uličce</div><p className="mt-2 text-[11px] leading-4 text-[#6b4a4a]">Po 2 nepochopeních nabídnout konkrétní témata. Kontakt s operátorem zůstává na jediném místě v hlavičce.</p></section>
          </div>
        </aside> : null}
      </div>
    </main>
  );
}
