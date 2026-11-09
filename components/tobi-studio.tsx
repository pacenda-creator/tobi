"use client";

import {
  BookOpenCheck,
  ChevronRight,
  CircleHelp,
  Camera,
  ExternalLink,
  Globe2,
  LockKeyhole,
  Menu,
  Minus,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Router,
  Send,
  Settings2,
  Signal,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ChatBlockRenderer } from "@/components/tobi/chat-block-renderer";
import { CapabilityCarousel } from "@/components/tobi/capability-carousel";
import { IncidentCard } from "@/components/tobi/incident-card";
import { IntroTopics } from "@/components/tobi/intro-topics";
import { TobiBrandIcon, type TobiBrandIconVariant } from "@/components/tobi/tobi-brand-icon";
import { chatRequestV1Schema, chatResponseV1Schema, salvageChatResponseTextV1, type ChatRequestV1, type ChatResponseV1, type ConversationStateV1, type QuickReplyV1 } from "@/lib/contracts/chat/v1";
import { INTRO_HELPER_MAX_LENGTH, parseIntroHelperMarkup } from "@/lib/intro-helper-markup";
import { deterministicOperatorReply, isOperatorRequest, MOCK_AGENT, MOCK_AGENT_CONNECT_DELAY_MS } from "@/lib/mock-operator";
import { applyOperatorSessionEvent } from "@/lib/operator-session";
import {
  defaultDemoRuntimeState,
  defaultTobiConfig,
  defaultTobiPublicConfig,
  demoMajorIncident,
  modelSupportsReasoning,
  modelSupportsTemperature,
  tobiConfigSchema,
  tobiPublicConfigSchema,
  type OperatorAvailability,
  type TobiAdminConfigSnapshot,
  type TobiConfig,
  type TobiPublicConfig,
  type TobiPublicConfigSnapshot,
} from "@/lib/tobi-config";
import { mergeTobiConfigDraft, shouldApplyTobiConfigVersion } from "@/lib/tobi-config-versioning";
import { ROUTER_IMAGE_MAX_BYTES } from "@/lib/router-diagnostics";

type Message = {
  id: string;
  role: "assistant" | "user" | "operator" | "system";
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

const ROUTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function normalizeRouterPhoto(file: File) {
  if (!ROUTER_IMAGE_TYPES.has(file.type)) throw new Error("unsupported_type");
  if (file.size > ROUTER_IMAGE_MAX_BYTES) throw new Error("too_large");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 160 || bitmap.height < 160) throw new Error("dimensions");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    if (Math.max(bitmap.width, bitmap.height) <= 2048) {
      return new File([file], `router-photo.${extension}`, { type: file.type, lastModified: Date.now() });
    }
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
    if (!context) throw new Error("processing");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, file.type === "image/jpeg" ? 0.86 : undefined));
    if (!blob || blob.size > ROUTER_IMAGE_MAX_BYTES) throw new Error("too_large");
    return new File([blob], `router-photo.${extension}`, { type: file.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function initialMessage(welcome = defaultTobiPublicConfig.copy.welcome): Message {
  return {
    id: `welcome-${Date.now()}`,
    role: "assistant",
    text: welcome,
    time: timeNow(),
  };
}

function IntroHelperCopy({ markup }: { markup: string }) {
  const parsed = parseIntroHelperMarkup(markup);
  if (!parsed.success) return <>{markup}</>;
  return <>{parsed.tokens.map((token, index) => {
    if (token.type === "text") return token.value;
    if (token.type === "strong") return <strong key={`${index}-strong`} className="font-semibold text-inherit">{token.value}</strong>;
    return <a key={`${index}-${token.url}`} href={token.url} target="_blank" rel="noopener noreferrer" aria-label={`${token.label}, otevře se na nové kartě`} className="font-semibold text-[#bd0000] underline decoration-[#e60000]/50 underline-offset-2 hover:text-[#8f0000] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]">{token.label}</a>;
  })}</>;
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

export default function TobiStudio({ customerOnly = false, initialConfigSnapshot = null }: { customerOnly?: boolean; initialConfigSnapshot?: TobiPublicConfigSnapshot | null }) {
  const [customerConfig, setCustomerConfig] = useState<TobiPublicConfig>(initialConfigSnapshot?.config ?? defaultTobiPublicConfig);
  const [adminConfig, setAdminConfig] = useState<TobiConfig>(defaultTobiConfig);
  const [introHelperTextTouched, setIntroHelperTextTouched] = useState(false);
  const config: TobiPublicConfig = customerOnly ? customerConfig : adminConfig;
  const [configVersion, setConfigVersion] = useState(initialConfigSnapshot?.configVersion ?? 0);
  const configVersionRef = useRef(initialConfigSnapshot?.configVersion ?? 0);
  const [configLoadState, setConfigLoadState] = useState<"loading" | "ready" | "error">(customerOnly && initialConfigSnapshot ? "ready" : "loading");
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");
  const [saveErrorKind, setSaveErrorKind] = useState<"conflict" | "generic" | null>(null);
  const savedAdminConfigRef = useRef<TobiConfig>(structuredClone(defaultTobiConfig));
  const adminConfigRef = useRef<TobiConfig>(structuredClone(defaultTobiConfig));
  const adminEditGenerationRef = useRef(0);
  const saveRequestGenerationRef = useRef(0);
  const [runtime, setRuntime] = useState(defaultDemoRuntimeState);
  const [messages, setMessages] = useState<Message[]>([initialMessage(initialConfigSnapshot?.config.copy.welcome)]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [endOperatorDialogOpen, setEndOperatorDialogOpen] = useState(false);
  const [operatorRating, setOperatorRating] = useState<"satisfied" | "dissatisfied" | null>(null);
  const [chatClosed, setChatClosed] = useState(false);
  const [incidentDismissed, setIncidentDismissed] = useState(false);
  const [incidentClock, setIncidentClock] = useState(() => Date.now());
  const [, setAnalyticsEvents] = useState<PrototypeAnalyticsEvent[]>([]);
  const [hasNewResponse, setHasNewResponse] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationStateV1 | null>(null);
  const [routerPhoto, setRouterPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [routerPhotoStatus, setRouterPhotoStatus] = useState<"idle" | "preparing" | "ready" | "uploading" | "error">("idle");
  const [routerPhotoError, setRouterPhotoError] = useState<string | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{ text: string; baseMessages: Message[]; displayText?: string; transitionId?: string } | null>(null);
  const [, setMode] = useState<"smart-demo" | "openai">("smart-demo");
  const [, setModel] = useState("chytré demo + lokální znalosti");
  const [knowledgeCount, setKnowledgeCount] = useState(887);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [desktopPreview, setDesktopPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const routerFileInputRef = useRef<HTMLInputElement>(null);
  const routerPhotoUrlRef = useRef<string | null>(null);
  const routerUploadAbortRef = useRef<AbortController | null>(null);
  const routerUploadGenerationRef = useRef(0);
  const introHelperTextRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const endOperatorPrimaryRef = useRef<HTMLButtonElement>(null);
  const wasClosedRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const lastAssistantIdRef = useRef(messages[0].id);
  const activeRequestUserIdRef = useRef<string | null>(null);
  const shouldFollowResponseRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const operatorGenerationRef = useRef(0);
  const welcomeUntouchedRef = useRef(true);
  const configBroadcastRef = useRef<BroadcastChannel | null>(null);
  const topics = config.topics;
  const introTopics = (() => {
    const byId = new Map(config.introUseCases.map((topic) => [topic.id, topic]));
    const ordered = config.presentation.intro.orderedTopicIds.map((id) => byId.get(id)).filter((topic): topic is typeof config.introUseCases[number] => Boolean(topic));
    const missing = config.introUseCases.filter((topic) => !config.presentation.intro.orderedTopicIds.includes(topic.id));
    return [...ordered, ...missing].slice(0, Math.max(1, config.presentation.intro.visibleTopicsCount));
  })();
  const introHelperMarkupValidation = useMemo(() => parseIntroHelperMarkup(adminConfig.presentation.intro.helperText), [adminConfig.presentation.intro.helperText]);

  const applyPublicSnapshot = useCallback((snapshotInput: unknown) => {
    if (!snapshotInput || typeof snapshotInput !== "object") return false;
    const candidate = snapshotInput as Partial<TobiPublicConfigSnapshot>;
    const parsed = tobiPublicConfigSchema.safeParse(candidate.config);
    if (!parsed.success || !Number.isSafeInteger(candidate.configVersion) || (candidate.configVersion || 0) < 1 || typeof candidate.updatedAt !== "string") return false;
    const version = candidate.configVersion as number;
    if (!shouldApplyTobiConfigVersion(configVersionRef.current, version)) return true;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const recoverFocus = Boolean(activeElement?.closest("#tobi-widget-panel"));
    const focusKey = activeElement?.dataset.tobiFocusKey;
    configVersionRef.current = version;
    setConfigVersion(version);
    setCustomerConfig(parsed.data);
    if (welcomeUntouchedRef.current) {
      setMessages((current) => current.length === 1 && current[0]?.role === "assistant"
        ? [{ ...current[0], text: parsed.data.copy.welcome }]
        : current);
    }
    if (recoverFocus && activeElement) {
      requestAnimationFrame(() => {
        if (document.contains(activeElement)) return;
        const keyedTarget = focusKey
          ? [...document.querySelectorAll<HTMLElement>("[data-tobi-focus-key]")].find((element) => element.dataset.tobiFocusKey === focusKey)
          : null;
        if (keyedTarget) {
          keyedTarget.focus({ preventScroll: true });
          if (document.activeElement === keyedTarget) return;
        }
        textareaRef.current?.focus({ preventScroll: true });
      });
    }
    setConfigLoadState("ready");
    return true;
  }, []);

  const refreshPublicConfig = useCallback(async (initial = false) => {
    try {
      const response = await fetch("/api/config/public", {
        cache: "no-store",
        headers: configVersionRef.current ? { "If-None-Match": `\"tobi-config-${configVersionRef.current}\"` } : undefined,
      });
      if (response.status === 304) {
        if (initial) setConfigLoadState("ready");
        return;
      }
      if (!response.ok || !applyPublicSnapshot(await response.json().catch(() => null))) throw new Error("config_load_failed");
    } catch {
      if (configVersionRef.current === 0) setConfigLoadState("error");
    }
  }, [applyPublicSnapshot]);

  useEffect(() => () => {
    routerUploadAbortRef.current?.abort();
    if (routerPhotoUrlRef.current) URL.revokeObjectURL(routerPhotoUrlRef.current);
  }, []);

  useEffect(() => {
    if (customerOnly) {
      if (initialConfigSnapshot) return;
      const frame = requestAnimationFrame(() => void refreshPublicConfig(true));
      return () => cancelAnimationFrame(frame);
    }
    let cancelled = false;
    fetch("/api/config/admin", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("admin_config_load_failed");
        return response.json() as Promise<TobiAdminConfigSnapshot>;
      })
      .then((snapshot) => {
        if (cancelled) return;
        const parsed = tobiConfigSchema.safeParse(snapshot.config);
        if (!parsed.success || !Number.isSafeInteger(snapshot.configVersion) || snapshot.configVersion < 1) throw new Error("invalid_admin_config");
        setAdminConfig(parsed.data);
        adminConfigRef.current = parsed.data;
        savedAdminConfigRef.current = structuredClone(parsed.data);
        setIntroHelperTextTouched(false);
        configVersionRef.current = snapshot.configVersion;
        setConfigVersion(snapshot.configVersion);
        if (welcomeUntouchedRef.current) setMessages((current) => current.length === 1 ? [{ ...current[0], text: parsed.data.copy.welcome }] : current);
        setSaveState("clean");
        setConfigLoadState("ready");
      })
      .catch(() => { if (!cancelled) setConfigLoadState("error"); });
    return () => { cancelled = true; };
  }, [customerOnly, initialConfigSnapshot, refreshPublicConfig]);

  useEffect(() => {
    if (!customerOnly) return;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("tobi-config-v1");
    configBroadcastRef.current = channel;
    if (channel) channel.onmessage = (event) => {
      const version = event.data && typeof event.data === "object" ? Number(event.data.configVersion) : 0;
      if (version > configVersionRef.current) void refreshPublicConfig();
    };
    const interval = window.setInterval(() => void refreshPublicConfig(), 1_000);
    const refreshWhenActive = () => { if (document.visibilityState === "visible") void refreshPublicConfig(); };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      channel?.close();
      configBroadcastRef.current = null;
    };
  }, [customerOnly, refreshPublicConfig]);

  useEffect(() => {
    if (!endOperatorDialogOpen) return;
    const frame = requestAnimationFrame(() => endOperatorPrimaryRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [endOperatorDialogOpen]);

  const incident = runtime.activeIncident;
  const incidentNotExpired = !incident?.expiresAt || Date.parse(incident.expiresAt) > incidentClock;
  const incidentTargeted = incident?.targeting !== "known-location" || runtime.incidentMatch === "matched";
  const incidentServiceSupported = Boolean(incident && config.features.majorIncidentServices.includes(incident.service));
  const incidentSourceTrusted = Boolean(incident && ["demo", "verified-feed", "manual"].includes(incident.source.kind));
  const showMajorIncident = Boolean(config.features.majorIncident && incident && incident.status === "active" && incidentNotExpired && incidentTargeted && incidentServiceSupported && incidentSourceTrusted && runtime.incidentMatch !== "not-matched" && !incidentDismissed);
  const introHelperMarkup = config.presentation.intro.helperText.trim() ? config.presentation.intro.helperText : null;
  const bottomAlignedWelcome = messages.length === 1 && messages[0]?.role === "assistant" && !messages[0]?.response && !busy && runtime.handoverState === "bot_active" && !showMajorIncident && config.presentation.intro.helperTextPlacement === "bottom";
  const redHeader = config.brand.headerStyle === "red";
  const headerIconButtonClass = redHeader ? "border-white/40 text-white hover:bg-white/15" : "border-[#dedede] text-[#444] hover:bg-[#f5f5f5]";
  const operatorStatusLabel = config.operatorAvailability === "online" ? "Operátor dostupný" : config.operatorAvailability === "offline" ? "Operátor nedostupný" : "Dostupnost neznámá";
  const operatorStatusClass = config.operatorAvailability === "online" ? "border-[#78bd8c] bg-[#e8f6ec] text-[#116b31] ring-2 ring-[#16853e]/15" : config.operatorAvailability === "offline" ? "border-[#c8c8c8] bg-[#f1f1f1] text-[#555]" : "border-[#e4bd55] bg-[#fff7dc] text-[#735600] ring-2 ring-[#e4bd55]/15";

  useEffect(() => {
    fetch("/api/status")
      .then(async (response) => await response.json() as { mode?: string; model?: string; knowledge?: { pages?: number } })
      .then((data) => {
        setMode(data.mode === "openai" ? "openai" : "smart-demo");
        setModel(data.model || "chytré demo + lokální znalosti");
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
    if (runtime.handoverState !== "handover_requested") return;
    const generation = operatorGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== operatorGenerationRef.current) return;
      setRuntime((current) => applyOperatorSessionEvent(current, "queue_started"));
      setMessages((current) => [...current, { id: uniqueId("assistant"), role: "assistant", text: "Právě hledám dostupného operátora. Děkuji za trpělivost.", time: timeNow() }]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runtime.handoverState]);

  useEffect(() => {
    if (runtime.handoverState !== "waiting_for_agent") return;
    const generation = operatorGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (generation !== operatorGenerationRef.current) return;
      setRuntime((current) => applyOperatorSessionEvent(current, "agent_connected"));
      setMessages((current) => [...current,
        { id: uniqueId("system"), role: "system", text: "Operátorka Jana se připojila ke konverzaci.", time: timeNow() },
        { id: uniqueId("operator"), role: "operator", text: "Dobrý den, tady Jana ze zákaznické péče. Ráda vám pomohu. Co pro vás mohu udělat?", time: timeNow() },
      ]);
    }, MOCK_AGENT_CONNECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [runtime.handoverState]);

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
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" || message.role === "operator");
    if (!latestAssistant || latestAssistant.id === lastAssistantIdRef.current) return;
    lastAssistantIdRef.current = latestAssistant.id;

    if (chatClosed) {
      const frame = requestAnimationFrame(() => setHasNewResponse(true));
      return () => cancelAnimationFrame(frame);
    }

    requestAnimationFrame(() => {
      if (shouldFollowResponseRef.current) {
        const scroller = chatScrollRef.current;
        const targetMessageId = latestAssistant.response?.intent.id === "tariff-comparison"
          ? latestAssistant.id
          : activeRequestUserIdRef.current || latestAssistant.id;
        const message = messageRefs.current.get(targetMessageId);
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

  function updateAdminConfig(updater: (current: TobiConfig) => TobiConfig) {
    const next = updater(adminConfigRef.current);
    adminConfigRef.current = next;
    adminEditGenerationRef.current += 1;
    setAdminConfig(next);
    if (welcomeUntouchedRef.current) {
      setMessages((current) => current.length === 1 && current[0]?.role === "assistant"
        ? [{ ...current[0], text: next.copy.welcome }]
        : current);
    }
    setSaveErrorKind(null);
    setSaveState((current) => current === "saving" ? current : "dirty");
  }

  async function saveAdminConfiguration() {
    if (configLoadState !== "ready" || saveState === "saving") return;
    if (!introHelperMarkupValidation.success) {
      setIntroHelperTextTouched(true);
      requestAnimationFrame(() => introHelperTextRef.current?.focus());
      return;
    }
    const requestGeneration = ++saveRequestGenerationRef.current;
    const submittedEditGeneration = adminEditGenerationRef.current;
    const submittedConfig = structuredClone(adminConfigRef.current);
    setSaveErrorKind(null);
    setSaveState("saving");
    try {
      const response = await fetch("/api/config/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: configVersionRef.current, config: submittedConfig }),
      });
      const payload = await response.json().catch(() => null) as TobiAdminConfigSnapshot | { error?: string; current?: TobiAdminConfigSnapshot } | null;
      if (requestGeneration !== saveRequestGenerationRef.current) return;
      if (response.status === 409 && payload && "current" in payload && payload.current) {
        const latest = tobiConfigSchema.parse(payload.current.config);
        const mergedDraft = mergeTobiConfigDraft(latest, savedAdminConfigRef.current, adminConfigRef.current);
        savedAdminConfigRef.current = structuredClone(latest);
        adminConfigRef.current = mergedDraft;
        setAdminConfig(mergedDraft);
        configVersionRef.current = payload.current.configVersion;
        setConfigVersion(payload.current.configVersion);
        setSaveErrorKind("conflict");
        setSaveState("error");
        return;
      }
      if (!response.ok || !payload || !("config" in payload)) throw new Error("config_save_failed");
      const parsed = tobiConfigSchema.safeParse(payload.config);
      if (!parsed.success || !Number.isSafeInteger(payload.configVersion) || payload.configVersion < 1) throw new Error("invalid_saved_config");
      savedAdminConfigRef.current = structuredClone(parsed.data);
      configVersionRef.current = payload.configVersion;
      setConfigVersion(payload.configVersion);
      if (adminEditGenerationRef.current === submittedEditGeneration) {
        adminConfigRef.current = parsed.data;
        setAdminConfig(parsed.data);
        setIntroHelperTextTouched(false);
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      setSaveErrorKind(null);
      const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("tobi-config-v1");
      channel?.postMessage({ configVersion: payload.configVersion });
      channel?.close();
    } catch {
      if (requestGeneration === saveRequestGenerationRef.current) {
        setSaveErrorKind("generic");
        setSaveState("error");
      }
    }
  }

  function releaseRouterPhotoState() {
    routerUploadAbortRef.current?.abort();
    routerUploadAbortRef.current = null;
    if (routerPhotoUrlRef.current) URL.revokeObjectURL(routerPhotoUrlRef.current);
    routerPhotoUrlRef.current = null;
    if (routerFileInputRef.current) routerFileInputRef.current.value = "";
    setRouterPhoto(null);
    setRouterPhotoStatus("idle");
    setRouterPhotoError(null);
  }

  function clearRouterPhoto() {
    routerUploadGenerationRef.current += 1;
    releaseRouterPhotoState();
  }

  function openRouterPhotoPicker() {
    if (!config.features.routerPhotoDiagnostics || busy) return;
    setRouterPhotoError(null);
    routerFileInputRef.current?.click();
  }

  async function handleRouterPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const generation = ++routerUploadGenerationRef.current;
    releaseRouterPhotoState();
    setRouterPhotoStatus("preparing");
    setRouterPhotoError(null);
    try {
      const normalized = await normalizeRouterPhoto(file);
      if (generation !== routerUploadGenerationRef.current) return;
      if (routerPhotoUrlRef.current) URL.revokeObjectURL(routerPhotoUrlRef.current);
      const previewUrl = URL.createObjectURL(normalized);
      routerPhotoUrlRef.current = previewUrl;
      setRouterPhoto({ file: normalized, previewUrl });
      setRouterPhotoStatus("ready");
    } catch (error) {
      if (generation !== routerUploadGenerationRef.current) return;
      const code = error instanceof Error ? error.message : "processing";
      setRouterPhotoStatus("error");
      setRouterPhotoError(code === "unsupported_type"
        ? "Použijte fotografii JPEG, PNG nebo WebP."
        : code === "too_large"
          ? "Fotografie je příliš velká. Maximální velikost je 6 MiB."
          : code === "dimensions"
            ? "Fotografie musí mít alespoň 160 × 160 px."
            : "Fotografii se nepodařilo bezpečně připravit. Vyberte jinou.");
    }
  }

  async function submitRouterPhoto() {
    if (!routerPhoto || !conversationState || busy) return;
    const generation = ++routerUploadGenerationRef.current;
    const controller = new AbortController();
    routerUploadAbortRef.current = controller;
    setRouterPhotoStatus("uploading");
    setRouterPhotoError(null);
    setBusy(true);
    const form = new FormData();
    form.set("image", routerPhoto.file);
    form.set("conversationState", JSON.stringify(conversationState));
    try {
      const response = await fetch("/api/router-diagnostics/v1/analyze", { method: "POST", body: form, signal: controller.signal });
      const payload = await response.json().catch(() => null) as unknown;
      if (generation !== routerUploadGenerationRef.current) return;
      const parsed = chatResponseV1Schema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string"
          ? payload.error.message
          : "Fotografii se nepodařilo vyhodnotit. Zkuste to znovu.";
        throw new Error(message);
      }
      const data = parsed.data;
      const userMessage: Message = { id: uniqueId("user"), role: "user", text: "Přikládám fotografii routeru.", time: timeNow() };
      setMessages((current) => [...current, userMessage, { id: uniqueId("assistant"), role: "assistant", text: data.text, time: timeNow(), response: data }]);
      activeRequestUserIdRef.current = userMessage.id;
      setConversationState(data.conversationState ?? null);
      releaseRouterPhotoState();
    } catch (error) {
      if (generation !== routerUploadGenerationRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setRouterPhotoStatus("error");
      setRouterPhotoError(error instanceof Error ? error.message : "Fotografii se nepodařilo vyhodnotit. Zkuste to znovu.");
    } finally {
      if (generation === routerUploadGenerationRef.current) {
        routerUploadAbortRef.current = null;
        setBusy(false);
      }
    }
  }

  function cancelRouterPhotoAndContinue() {
    const current = conversationState;
    clearRouterPhoto();
    setBusy(false);
    if (current?.scenarioId === "demo-internet" && current.stepId === "photo-offer") {
      void sendMessage("Pokračovat bez fotky.", messages, "Pokračovat bez fotky", "internet-photo-skip", true);
    } else if (current?.scenarioId === "router-photo-diagnostics" && current.stepId === "router-manual-model") {
      void sendMessage("Pokračovat bez fotky.", messages, "Pokračovat bez fotky", "router-skip-text", true);
    } else {
      requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
    }
  }

  function reset() {
    requestGenerationRef.current += 1;
    operatorGenerationRef.current += 1;
    clearRouterPhoto();
    const fresh = initialMessage(config.copy.welcome);
    welcomeUntouchedRef.current = true;
    setMessages([fresh]);
    lastAssistantIdRef.current = fresh.id;
    activeRequestUserIdRef.current = null;
    setDraft("");
    setBusy(false);
    setHasNewResponse(false);
    setConversationState(null);
    setLastFailedRequest(null);
    setEndOperatorDialogOpen(false);
    setOperatorRating(null);
    setChatClosed(false);
    setIncidentDismissed(false);
    setRuntime((current) => current.handoverState === "conversation_ended" ? applyOperatorSessionEvent(current, "new_chat") : { ...current, conversationMode: "ai", handoverState: "bot_active" });
  }

  function minimizeChat() {
    setChatClosed(true);
  }

  function closeChat() {
    if (["handover_requested", "waiting_for_agent", "agent_connected", "conversation_ended"].includes(runtime.handoverState)) {
      minimizeChat();
      return;
    }
    reset();
    setChatClosed(true);
  }

  function beginHandover(baseMessages = messages, addUserRequest = true) {
    if (runtime.handoverState !== "bot_active") return;
    welcomeUntouchedRef.current = false;
    operatorGenerationRef.current += 1;
    const handoverUserMessage = addUserRequest ? { id: uniqueId("user"), role: "user" as const, text: "Chci mluvit s operátorem.", time: timeNow() } : null;
    const next = handoverUserMessage ? [...baseMessages, handoverUserMessage] : baseMessages;
    if (handoverUserMessage) activeRequestUserIdRef.current = handoverUserMessage.id;
    setMessages([...next,
      { id: uniqueId("assistant"), role: "assistant", text: "Rozumím. Předám vás kolegovi ze zákaznické péče. Chvilku prosím vydržte.", time: timeNow() },
    ]);
    setRuntime((current) => applyOperatorSessionEvent(current, "request_handover"));
  }

  function cancelHandover() {
    if (runtime.handoverState !== "waiting_for_agent") return;
    operatorGenerationRef.current += 1;
    setRuntime((current) => applyOperatorSessionEvent(current, "cancel_waiting"));
    setMessages((current) => [...current, { id: uniqueId("system"), role: "system", text: "Čekání na operátora bylo zrušeno. Pokračujete s TOBi.", time: timeNow() }]);
  }

  function confirmEndOperatorChat() {
    operatorGenerationRef.current += 1;
    setEndOperatorDialogOpen(false);
    setBusy(false);
    setRuntime((current) => applyOperatorSessionEvent(current, "agent_disconnected"));
    setMessages((current) => [...current, { id: uniqueId("system"), role: "system", text: "Konverzace s operátorkou byla ukončena.", time: timeNow() }]);
  }

  async function receiveOperatorReply(nextMessages: Message[]) {
    setBusy(true);
    const generation = operatorGenerationRef.current;
    try {
      const response = await fetch("/api/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.filter((message) => message.role === "user" || message.role === "operator").slice(-10).map((message) => ({ role: message.role, content: message.text })) }),
      });
      const payload = await response.json().catch(() => null) as { text?: string } | null;
      if (generation !== operatorGenerationRef.current || !payload?.text) return;
      setMessages((current) => [...current, { id: uniqueId("operator"), role: "operator", text: payload.text!, time: timeNow() }]);
    } catch {
      const lastUserText = [...nextMessages].reverse().find((message) => message.role === "user")?.text || "";
      if (generation === operatorGenerationRef.current) setMessages((current) => [...current, { id: uniqueId("operator"), role: "operator", text: deterministicOperatorReply(lastUserText), time: timeNow() }]);
    } finally {
      if (generation === operatorGenerationRef.current) setBusy(false);
    }
  }

  async function sendMessage(text = draft, baseMessages = messages, displayText?: string, transitionId?: string, allowWhileBusy = false, forceFollowResponse = false) {
    const clean = text.trim();
    if (!clean || (busy && !allowWhileBusy) || runtime.handoverState === "handover_requested" || runtime.handoverState === "waiting_for_agent" || runtime.handoverState === "conversation_ended") return;
    welcomeUntouchedRef.current = false;

    const scroller = chatScrollRef.current;
    shouldFollowResponseRef.current = forceFollowResponse || !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;

    const userMessage: Message = { id: uniqueId("user"), role: "user", text: displayText || clean, requestText: displayText ? clean : undefined, time: timeNow() };
    const nextMessages = [...baseMessages, userMessage];
    activeRequestUserIdRef.current = userMessage.id;
    setMessages(nextMessages);
    setDraft("");
    if (runtime.handoverState === "bot_active" && isOperatorRequest(clean)) {
      beginHandover(nextMessages, false);
      return;
    }
    if (runtime.handoverState === "agent_connected") {
      void receiveOperatorReply(nextMessages);
      return;
    }
    setBusy(true);
    requestAnimationFrame(() => {
      const anchor = messageRefs.current.get(userMessage.id);
      const messageScroller = chatScrollRef.current;
      if (anchor && messageScroller) messageScroller.scrollTo({ top: Math.max(0, anchor.offsetTop - 12), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const requestGeneration = requestGenerationRef.current;
    let rawResponsePayload: unknown = null;

    try {
      const requestPayload: ChatRequestV1 = chatRequestV1Schema.parse({
        contractVersion: "1",
        requestId: uniqueId("req"),
        messages: nextMessages.filter((message) => message.role === "user" || message.role === "assistant").slice(-12).map(({ role, text, requestText }) => ({ role, content: requestText || text })),
        context: { locale: "cs-CZ", channel: "web" },
        conversationState,
        transitionId,
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
      if (customerOnly && data.configVersion && data.configVersion > configVersionRef.current) void refreshPublicConfig();
      setConversationState(data.conversationState ?? null);
      setLastFailedRequest(data.mode === "fallback" && data.fallback.retryable ? { text: clean, baseMessages, displayText, transitionId } : null);
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
      setLastFailedRequest({ text: clean, baseMessages, displayText, transitionId });
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
    const fresh = initialMessage(config.copy.welcome);
    welcomeUntouchedRef.current = false;
    setMobileSidebar(false);
    void sendMessage(prompt, [fresh]);
  }

  function requestHandoff() {
    beginHandover(messages, true);
  }

  function handleQuickReply(reply: QuickReplyV1) {
    if (busy) return;
    if (reply.action.kind === "requestUpload") {
      openRouterPhotoPicker();
      return;
    }
    if (reply.id === "internet-resolved" || reply.id === "internet-not-resolved") setAnalyticsEvents((events) => [...events, { type: "task_resolution", value: reply.id === "internet-resolved" ? "yes" : "no", at: new Date().toISOString() }]);
    void sendMessage(reply.action.message, messages, reply.label, reply.action.transitionId, false, true);
  }

  function retryLastRequest() {
    if (!lastFailedRequest || busy) return;
    void sendMessage(lastFailedRequest.text, lastFailedRequest.baseMessages, lastFailedRequest.displayText, lastFailedRequest.transitionId);
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
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" || message.role === "operator");
    if (!latestAssistant) return;
    const scroller = chatScrollRef.current;
    const targetMessageId = latestAssistant.response?.intent.id === "tariff-comparison"
      ? latestAssistant.id
      : activeRequestUserIdRef.current || latestAssistant.id;
    const message = messageRefs.current.get(targetMessageId);
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
    if (endOperatorDialogOpen) {
      event.stopPropagation();
      setEndOperatorDialogOpen(false);
      return;
    }
    if (customerOnly) {
      event.stopPropagation();
      minimizeChat();
    }
  }

  if (customerOnly && configLoadState !== "ready") {
    return <main className="grid min-h-[100dvh] place-items-center bg-[#f2f2f2] p-5">
      <section className="w-full max-w-sm rounded-2xl border border-[#dedede] bg-white p-6 text-center shadow-sm" role={configLoadState === "error" ? "alert" : "status"}>
        <h1 className="text-lg font-extrabold text-[#222]">{configLoadState === "loading" ? "Načítám chat…" : "Chat se nepodařilo načíst."}</h1>
        {configLoadState === "error" ? <button type="button" onClick={() => { setConfigLoadState("loading"); void refreshPublicConfig(true); }} className="mt-4 min-h-11 rounded-full bg-[#e60000] px-5 text-sm font-bold text-white">Zkusit znovu</button> : null}
      </section>
    </main>;
  }

  return (
    <main className={customerOnly ? "min-h-[100dvh] bg-[#f2f2f2]" : "min-h-screen bg-[#f2f2f2] lg:h-screen lg:overflow-hidden"}>
      {customerOnly ? <CustomerPagePreview chatOpen={!chatClosed} /> : null}
      {false ? <header className="flex h-16 items-center justify-between border-b border-[#dedede] bg-white px-4 sm:px-6">
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

      <div className={customerOnly ? "tobi-customer-layer" : "grid lg:h-[100dvh] lg:grid-cols-[360px_minmax(0,1fr)]"}>
        {false ? <aside className={`${mobileSidebar ? "fixed inset-0 z-50 block bg-black/25" : "hidden"} lg:order-3 lg:static lg:z-auto lg:block lg:bg-transparent`} onClick={() => setMobileSidebar(false)}>
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

        <section className={customerOnly ? "h-full pointer-events-none" : "studio-grid relative order-2 flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f7f7f7] p-3 sm:p-4"}>
          {false ? <div className="mx-auto mb-3 flex w-full max-w-[780px] items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-[#777]">Interaktivní náhled</p><h1 className="mt-0.5 text-lg font-extrabold tracking-[-.035em] sm:text-xl">TOBi nové generace</h1></div>
            <div className="hidden items-center gap-2 sm:flex">
              <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d6d6d6] bg-white px-4 text-xs font-bold text-[#333] hover:bg-[#f5f5f5]">Zákaznický náhled <ExternalLink size={13} /></a>
              <div className="flex rounded-full border border-[#d6d6d6] bg-white p-1">
                <button type="button" onClick={() => setDesktopPreview(false)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Mobil</button>
                <button type="button" onClick={() => setDesktopPreview(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${desktopPreview ? "bg-[#222] text-white" : "text-[#666]"}`}>Desktop</button>
              </div>
            </div>
          </div> : null}

          <div className={customerOnly ? "tobi-widget-shell" : `mx-auto flex min-h-0 w-full flex-1 transition-all ${desktopPreview ? "max-w-[720px]" : "max-w-[520px]"} ${chatClosed ? "items-end justify-end pb-4" : "items-center justify-center"}`}>
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
                <span className={`grid h-10 w-10 place-items-center rounded-full text-[#e60000] ${config.brand.iconVariant === "ai-modern" ? "bg-white ring-1 ring-[#dedede]" : "bg-[#fff0f0]"}`} aria-hidden="true"><TobiBrandIcon variant={config.brand.iconVariant} size={config.brand.iconVariant === "sparkles" ? 24 : 32} /></span>
                <span><span className="block text-sm font-extrabold text-[#222]">Zeptat se TOBiho</span><span className="block text-[11px] text-[#777]">AI asistent</span></span>
                {hasNewResponse ? <span className="absolute right-3 top-2 h-3 w-3 rounded-full border-2 border-white bg-[#e60000]" aria-hidden="true" /> : null}
              </button>
            <div
              id="tobi-widget-panel"
              hidden={chatClosed}
              role="region"
              aria-labelledby="tobi-widget-title"
              onKeyDown={onWidgetKeyDown}
              className={`relative min-h-0 w-full flex-col overflow-hidden bg-white ${chatClosed ? "hidden" : "flex"} ${customerOnly ? "tobi-widget-panel rounded-[20px] border border-[#d7d7d7] shadow-[0_22px_60px_rgba(0,0,0,.16)] max-md:rounded-none max-md:border-0 max-md:shadow-none" : "h-[min(740px,100%)] rounded-[26px] border border-[#d7d7d7] shadow-[0_26px_70px_rgba(0,0,0,.14)]"}`}
            >
              <header className={`relative shrink-0 border-b px-2 py-2 transition-colors min-[360px]:px-3 sm:px-4 ${redHeader ? "border-[#bd0000] bg-[#e60000]" : "border-[#e9e9e9] bg-white"}`}>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex shrink-0 items-center gap-1 min-[360px]:gap-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center min-[360px]:h-10 min-[360px]:w-10 min-[360px]:rounded-full ${config.brand.iconVariant === "sparkles" ? redHeader ? "text-white min-[360px]:bg-white/15" : "text-[#e60000] min-[360px]:bg-[#fff0f0]" : "bg-white text-[#e60000]"}`} aria-hidden="true"><TobiBrandIcon variant={config.brand.iconVariant} size={config.brand.iconVariant === "sparkles" ? 24 : 32} /></span>
                    <div id="tobi-widget-title" className={`shrink-0 whitespace-nowrap text-[length:var(--tobi-font-title)] font-bold leading-6 ${redHeader ? "text-white" : "text-[#222]"}`}>{config.brand.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0 min-[360px]:gap-1">
                    {config.headerActions.agent && runtime.handoverState === "bot_active" ? <button type="button" data-tobi-focus-key="header-agent" onClick={requestHandoff} aria-label={`Spustit simulaci přepojení na operátora. ${operatorStatusLabel}`} title={operatorStatusLabel} className={`relative grid h-11 w-11 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] ${operatorStatusClass}`}>
                      <UserRound size={20} strokeWidth={2.2} aria-hidden="true" />
                      <span className={`absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white ${config.operatorAvailability === "online" ? "bg-[#16853e]" : config.operatorAvailability === "offline" ? "bg-[#777]" : "bg-[#e4a900]"}`} aria-hidden="true" />
                    </button> : null}
                    {runtime.handoverState === "waiting_for_agent" ? <button type="button" onClick={cancelHandover} className={`min-h-10 rounded-full border px-3 text-xs font-bold ${redHeader ? "border-white/40 bg-white/10 text-white hover:bg-white/20" : "border-[#d5d5d5] text-[#555] hover:bg-[#f5f5f5]"}`}>Zrušit čekání</button> : null}
                    {runtime.handoverState === "agent_connected" ? <button type="button" onClick={() => setEndOperatorDialogOpen(true)} className={`min-h-10 rounded-full border px-3 text-xs font-bold ${redHeader ? "border-white/40 bg-white/10 text-white hover:bg-white/20" : "border-[#d5d5d5] text-[#555] hover:bg-[#f5f5f5]"}`}>Ukončit chat</button> : null}
                    {config.headerActions.newRequest && (runtime.handoverState === "bot_active" || runtime.handoverState === "conversation_ended") ? <button type="button" data-tobi-focus-key="header-new-chat" onClick={reset} title="Nový chat" className={`grid h-11 w-11 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] ${headerIconButtonClass}`} aria-label="Nový chat"><SquarePen size={18} aria-hidden="true" /></button> : null}
                    {config.headerActions.minimize ? <button type="button" data-tobi-focus-key="header-minimize" onClick={minimizeChat} title="Minimalizovat chat" className={`grid h-11 w-11 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] ${headerIconButtonClass}`} aria-label="Minimalizovat chat"><Minus size={20} strokeWidth={2.4} aria-hidden="true" /></button> : null}
                    {config.headerActions.close ? <button type="button" data-tobi-focus-key="header-close" onClick={closeChat} title="Zavřít okno chatu" className={`grid h-11 w-11 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] ${headerIconButtonClass}`} aria-label="Zavřít okno chatu"><X size={18} aria-hidden="true" /></button> : null}
                  </div>
                </div>
                <p className={`mt-2 text-xs leading-4 ${redHeader ? "text-white/85" : "text-[#666]"}`}>{config.brand.disclaimer}</p>
                {runtime.handoverState === "waiting_for_agent" ? <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#fff6df] px-3 py-2 text-xs font-semibold text-[#695015]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#e6a700]" />Čekáte na spojení s operátorem <span className="ml-auto text-[10px] font-normal">simulace</span></div> : null}
                {runtime.handoverState === "agent_connected" ? <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#edf8f0] px-3 py-2 text-xs text-[#24613a]"><span className="h-2 w-2 rounded-full bg-[#16853e]" /><span><strong>Spojeno s operátorkou</strong><span className="ml-1">Jana · Zákaznická péče</span></span><span className="ml-auto text-[10px]">simulace</span></div> : null}

              </header>

              {endOperatorDialogOpen ? <div className="absolute inset-0 z-40 grid place-items-center bg-black/30 p-4"><section role="dialog" aria-modal="true" aria-labelledby="end-operator-title" aria-describedby="end-operator-description" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h2 id="end-operator-title" className="text-lg font-extrabold text-[#222]">Ukončit chat s operátorkou?</h2><p id="end-operator-description" className="mt-2 text-sm leading-5 text-[#666]">Spojení s operátorkou se ukončí. Pokud budete potřebovat další pomoc, můžete zahájit nový chat.</p><div className="mt-5 grid gap-2"><button ref={endOperatorPrimaryRef} type="button" onClick={confirmEndOperatorChat} className="min-h-11 rounded-full bg-[#e60000] px-4 text-sm font-bold text-white">Ukončit chat</button><button type="button" onClick={() => setEndOperatorDialogOpen(false)} className="min-h-11 rounded-full border border-[#ccc] px-4 text-sm font-bold text-[#333]">Pokračovat v chatu</button></div></section></div> : null}

              <div className="relative min-h-0 flex-1">
                <div aria-live="polite" className="sr-only">{!busy && ["assistant", "operator", "system"].includes(messages.at(-1)?.role || "") ? messages.at(-1)?.text : ""}</div>
                <div ref={chatScrollRef} onScroll={handleChatScroll} className={`chat-scrollbar h-full overflow-y-auto bg-white ${customerOnly ? "px-4 py-5 md:py-3" : "px-4 py-5 sm:px-5"} ${bottomAlignedWelcome ? "flex flex-col" : customerOnly ? "space-y-5 md:space-y-3" : "space-y-5"}`}>
                  {messages.map((message, index) => {
                    const response = message.response;
                    const hasStructuredContent = response?.blocks.some((block) => block.type !== "sourceList") || false;
                    const isInitialWelcome = index === 0 && messages.length === 1;
                    const showsIncidentInsteadOfWelcome = isInitialWelcome && showMajorIncident;
                    return (
                    <article
                      key={message.id}
                      ref={(node) => { if (node) messageRefs.current.set(message.id, node); else messageRefs.current.delete(message.id); }}
                      className={`message-rise scroll-mt-5 ${message.role === "user" ? "ml-auto max-w-[82%]" : "max-w-full"} ${bottomAlignedWelcome && isInitialWelcome ? "flex flex-1 flex-col" : ""}`}
                    >
                      {message.role === "user" ? (
                        <div className="flex flex-col items-end">
                          <div className="rounded-[var(--tobi-radius-bubble)] rounded-br-md bg-[#f0f0ee] px-4 py-3 text-[length:var(--tobi-font-message)] leading-[var(--tobi-line-message)] text-[#222]">{message.text}</div>
                          {config.features.timestamps ? <span className="mt-1 px-1 text-[10px] text-[#999]">{message.time}</span> : null}
                        </div>
                      ) : message.role === "system" ? (
                        <div className="mx-auto w-fit rounded-full bg-[#f0f0f0] px-3 py-2 text-center text-xs font-semibold text-[#666]">{message.text}</div>
                      ) : message.role === "operator" ? (
                        <div className="max-w-[88%]"><div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#24613a]"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e1f5e7]">J</span>{MOCK_AGENT.name} · {MOCK_AGENT.role}</div><div className="rounded-[var(--tobi-radius-bubble)] rounded-bl-md border border-[#cfe8d6] bg-[#f4fbf6] px-4 py-3 text-[length:var(--tobi-font-message)] leading-[var(--tobi-line-message)] text-[#222]">{message.text}</div>{config.features.timestamps ? <span className="mt-1 block px-1 text-[10px] text-[#999]">{message.time}</span> : null}</div>
                      ) : (
                        <>
                          {!showsIncidentInsteadOfWelcome && !bottomAlignedWelcome ? isInitialWelcome ? <h2 className="max-w-[65ch] text-xl font-bold leading-[26px] text-[#222]">{message.text}</h2> : <p className={`text-[length:var(--tobi-font-message)] leading-[var(--tobi-line-message)] text-[#333] ${hasStructuredContent ? "max-w-[65ch]" : "rounded-[var(--tobi-radius-bubble)] border border-[#e5e5e5] bg-[#fafafa] px-4 py-3"}`}>{message.text}</p> : null}
                          {config.features.timestamps && !showsIncidentInsteadOfWelcome && !bottomAlignedWelcome ? <span className="mt-1 block text-[10px] text-[#999]">{message.time}</span> : null}

                          {isInitialWelcome && (showMajorIncident && incident ? <div className="mt-1"><IncidentCard incident={incident} onOtherTopic={() => setIncidentDismissed(true)} /></div> : bottomAlignedWelcome || config.presentation.intro.displayMode !== "none" || introHelperMarkup ? <div className={bottomAlignedWelcome ? "flex flex-1 flex-col" : config.presentation.intro.displayMode === "none" ? "mt-2" : "mt-3 md:mt-2"}>
                            {config.presentation.intro.displayMode === "carousel" ? <CapabilityCarousel items={introTopics} onSelect={selectIntroTopic} wideBreakpoint={config.presentation.carousel.wideBreakpoint} /> : config.presentation.intro.displayMode === "list" ? <IntroTopics items={introTopics} visibleCount={introTopics.length} onSelect={selectIntroTopic} /> : null}
                            {bottomAlignedWelcome ? <div className="mt-auto pt-3 md:pt-2">
                              <h2 className="max-w-[65ch] text-xl font-bold leading-[26px] text-[#222]">{message.text}</h2>
                              {config.features.timestamps ? <span className="mt-1 block text-[10px] text-[#999]">{message.time}</span> : null}
                              {introHelperMarkup ? <p className="mt-2 whitespace-pre-line [overflow-wrap:anywhere] text-sm leading-5 text-[#666]"><IntroHelperCopy markup={introHelperMarkup} /></p> : null}
                            </div> : introHelperMarkup ? <p className={`${config.presentation.intro.displayMode === "none" ? "" : "mt-3 md:mt-2"} whitespace-pre-line [overflow-wrap:anywhere] text-sm leading-5 text-[#666]`}><IntroHelperCopy markup={introHelperMarkup} /></p> : null}
                          </div> : null)}

                          {response ? <ChatBlockRenderer
                            response={response}
                            preferMedia={config.features.mediaCards}
                            showPresetSources={config.features.sources}
                            renderMode={config.presentation.renderMode}
                            loop={config.presentation.carousel.loop}
                            wideBreakpoint={config.presentation.carousel.wideBreakpoint}
                            busy={busy}
                            onSendMessage={(text, label, transitionId) => void sendMessage(text, messages, label, transitionId, false, true)}
                            onRequestUpload={openRouterPhotoPicker}
                          /> : null}

                          {!!response?.quickReplies.length && (
                            <div>
                            {response.quickReplyPrompt ? <p className="mt-4 text-sm font-semibold text-[#444]">{response.quickReplyPrompt}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {response.quickReplies.slice(0, 2).map((reply) => <button key={reply.id} type="button" disabled={busy} onClick={() => handleQuickReply(reply)} className="min-h-11 rounded-full border border-[#d3d3d3] bg-white px-4 py-2 text-sm font-semibold leading-5 text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000] disabled:cursor-not-allowed disabled:opacity-50">{reply.label}</button>)}
                            </div>
                            </div>
                          )}

                          {response?.mode === "fallback" && response.fallback.retryable && lastFailedRequest && message.id === messages.at(-1)?.id ? <div className="mt-3"><button type="button" disabled={busy} onClick={retryLastRequest} className="min-h-11 rounded-full border border-[#d3d3d3] bg-white px-4 py-2 text-sm font-semibold leading-5 text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000] disabled:cursor-not-allowed disabled:opacity-50">Zkusit znovu</button></div> : null}

                          {config.features.feedback && index > 0 && response && response.quickReplyPrompt !== "Pomohlo to?" && (
                            <div className="mt-3 flex items-center gap-1 text-xs text-[#777]"><span className="mr-1">Byla tato odpověď užitečná?</span><button type="button" onClick={() => rateMessage(message.id, "up")} className={`grid h-11 w-11 place-items-center rounded-full ${message.feedback === "up" ? "bg-[#e1f5e7] text-[#16853e]" : "hover:bg-[#eee]"}`} aria-label="Odpověď byla užitečná"><ThumbsUp size={15} /></button><button type="button" onClick={() => rateMessage(message.id, "down")} className={`grid h-11 w-11 place-items-center rounded-full ${message.feedback === "down" ? "bg-[#ffe5e5] text-[#bd0000]" : "hover:bg-[#eee]"}`} aria-label="Odpověď nebyla užitečná"><ThumbsDown size={15} /></button></div>
                          )}
                        </>
                      )}
                    </article>
                    );
                  })}

                  {runtime.handoverState === "conversation_ended" ? <section className="rounded-2xl border border-[#dedede] bg-[#fafafa] p-4 text-center"><h2 className="text-lg font-extrabold text-[#222]">Konverzace byla ukončena</h2><p className="mt-1 text-sm text-[#666]">Děkujeme, že jste nás kontaktovali.</p>{config.features.feedback ? <><p className="mt-4 text-sm font-bold text-[#333]">Jak jste byli spokojeni s pomocí operátorky?</p>{operatorRating ? <p className="mt-3 rounded-xl bg-[#edf8f0] p-3 text-sm font-semibold text-[#24613a]">Děkujeme za hodnocení.</p> : <div className="mt-3 flex justify-center gap-2"><button type="button" onClick={() => setOperatorRating("satisfied")} className="min-h-11 rounded-full border border-[#ccc] bg-white px-4 text-sm font-bold">Spokojen/a</button><button type="button" onClick={() => setOperatorRating("dissatisfied")} className="min-h-11 rounded-full border border-[#ccc] bg-white px-4 text-sm font-bold">Nespokojen/a</button></div>}</> : null}<button type="button" onClick={reset} className="mt-4 min-h-11 rounded-full bg-[#e60000] px-5 text-sm font-bold text-white">Nový chat</button></section> : null}

                  {busy && <div className="message-rise flex items-center gap-2 text-xs text-[#666]" role="status"><span>{runtime.handoverState === "agent_connected" ? "Jana píše" : "TOBi připravuje odpověď"}</span><span className="flex gap-1">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-[#e60000]" style={{ animation: `blink 1.1s ${dot * 0.15}s infinite` }} />)}</span></div>}
                </div>
                {hasNewResponse && <button type="button" onClick={revealLatestResponse} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[#d7d7d7] bg-white px-4 py-2 text-xs font-bold text-[#333] shadow-lg">Nová odpověď ↓</button>}
              </div>

              <form onSubmit={onSubmit} className={`shrink-0 border-t border-[#e1e1e1] bg-white ${customerOnly ? "p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" : "p-3 sm:p-4"}`}>
                <input ref={routerFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1} onChange={(event) => void handleRouterPhotoSelected(event)} aria-hidden="true" />
                {routerPhotoStatus !== "idle" ? <section aria-label="Fotografie routeru před odesláním" className="mb-3 rounded-2xl border border-[#d8d8d8] bg-[#fafafa] p-3">
                  <div className="flex items-start gap-3">
                    {routerPhoto ? <div role="img" aria-label="Náhled vybrané fotografie routeru" className="h-20 w-20 shrink-0 rounded-xl border border-[#ddd] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${routerPhoto.previewUrl})` }} /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-[#ccc] bg-white text-[#777]"><Camera size={24} aria-hidden="true" /></div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-[#222]">Fotografie routeru</p>
                      <p className="mt-1 text-xs leading-4 text-[#666]">Vyfoťte přední panel s kontrolkami. Štítek s heslem nebo QR kódem nechte mimo záběr.</p>
                      {routerPhoto ? <p className="mt-1 text-[11px] text-[#777]">Připraveno k odeslání · {(routerPhoto.file.size / 1024 / 1024).toFixed(1)} MiB</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 rounded-xl bg-[#fff6df] px-3 py-2 text-[11px] leading-4 text-[#695015]">Fotografie zatím nebyla odeslána. Po potvrzení ji jednorázově zpracuje OpenAI pouze pro rozpoznání routeru a kontrolek. TOBi ji trvale neuloží.</p>
                  <div aria-live="polite" className="mt-2 min-h-4 text-xs font-semibold text-[#555]">{routerPhotoStatus === "preparing" ? "Připravuji bezpečný náhled…" : routerPhotoStatus === "uploading" ? "Prohlížím fotografii…" : routerPhotoError || ""}</div>
                  {routerPhotoError ? <p role="alert" className="mt-1 text-xs font-semibold text-[#b00000]">{routerPhotoError}</p> : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={!routerPhoto || routerPhotoStatus === "preparing" || routerPhotoStatus === "uploading"} onClick={() => void submitRouterPhoto()} className="min-h-11 rounded-full bg-[#e60000] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#ef9b9b]">{routerPhotoStatus === "uploading" ? "Odesílám…" : "Odeslat fotografii"}</button>
                    <button type="button" disabled={routerPhotoStatus === "uploading"} onClick={openRouterPhotoPicker} className="min-h-11 rounded-full border border-[#bbb] bg-white px-4 text-sm font-bold text-[#333] disabled:opacity-50">Vybrat jinou</button>
                    <button type="button" disabled={routerPhotoStatus === "uploading"} onClick={clearRouterPhoto} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bbb] bg-white px-4 text-sm font-bold text-[#333] disabled:opacity-50"><Trash2 size={16} aria-hidden="true" />Odebrat</button>
                    <button type="button" onClick={cancelRouterPhotoAndContinue} className="min-h-11 rounded-full border border-transparent px-4 text-sm font-bold text-[#555] hover:bg-[#eee]">{conversationState?.stepId === "photo-offer" || conversationState?.stepId === "router-manual-model" ? "Pokračovat bez fotky" : "Zrušit"}</button>
                  </div>
                </section> : null}
                <div className="flex min-h-14 items-end gap-2 rounded-[18px] border border-[#ccc] bg-white p-2 pl-4 transition focus-within:border-[#e60000] focus-within:ring-4 focus-within:ring-[#ffe5e5]">
                  <textarea ref={textareaRef} rows={1} maxLength={4_000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} disabled={runtime.handoverState === "handover_requested" || runtime.handoverState === "waiting_for_agent" || runtime.handoverState === "conversation_ended"} placeholder={runtime.handoverState === "handover_requested" || runtime.handoverState === "waiting_for_agent" ? "Čekáte na operátora…" : runtime.handoverState === "conversation_ended" ? "Konverzace byla ukončena" : runtime.handoverState === "agent_connected" ? "Napište zprávu Janě…" : "Napište zprávu…"} aria-label={runtime.handoverState === "agent_connected" ? "Zpráva pro operátorku Janu" : "Zpráva pro TOBiho"} className={`max-h-24 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 leading-5 outline-none placeholder:text-[#888] disabled:cursor-not-allowed disabled:bg-transparent ${customerOnly ? "text-base" : "text-[14px]"}`} />
                  <button type="submit" disabled={!draft.trim() || busy || runtime.handoverState === "handover_requested" || runtime.handoverState === "waiting_for_agent" || runtime.handoverState === "conversation_ended"} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e60000] text-white transition hover:bg-[#bd0000] disabled:cursor-not-allowed disabled:bg-[#ef9b9b]" aria-label="Odeslat"><Send size={17} /></button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {!customerOnly ? <aside className="order-1 min-h-0 overflow-y-auto border-r border-[#dedede] bg-white p-5">
          <div className="mb-5 border-b border-[#e5e5e5] pb-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#777]">Interní prototyp</p><h1 className="mt-1 text-xl font-extrabold tracking-[-.03em]">TOBi Studio</h1><p className="mt-1 text-xs text-[#666]">Konfigurace a scénáře</p></div><Settings2 size={18} className="mt-1 text-[#666]" /></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={reset} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d4d4d4] text-xs font-bold"><RefreshCw size={14} /> Nový test</button><a href="/" target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d4d4d4] text-xs font-bold">Zákaznický náhled <ExternalLink size={13} /></a></div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1"><button type="button" onClick={() => setDesktopPreview(false)} className={`rounded-lg py-2 text-xs font-bold ${!desktopPreview ? "bg-white shadow-sm" : "text-[#666]"}`}>Mobil</button><button type="button" onClick={() => setDesktopPreview(true)} className={`rounded-lg py-2 text-xs font-bold ${desktopPreview ? "bg-white shadow-sm" : "text-[#666]"}`}>Desktop</button></div></div>

          <section className="mb-5 rounded-2xl border border-[#dedede] bg-[#fafafa] p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold">Globální nastavení</p><p className="mt-0.5 text-[10px] text-[#777]">Verze {configVersion || "—"}</p></div><button type="button" onClick={() => void saveAdminConfiguration()} disabled={configLoadState !== "ready" || saveState === "saving" || (saveState !== "dirty" && saveState !== "error")} className="min-h-10 rounded-full bg-[#e60000] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-[#ef9b9b]">{saveState === "saving" ? "Ukládám…" : saveErrorKind === "conflict" ? "Uložit sloučené změny" : saveState === "error" ? "Zkusit uložit znovu" : "Uložit"}</button></div>
            {configLoadState === "error" ? <p className="mt-3 text-xs leading-4 text-[#b00000]">Konfiguraci se nepodařilo načíst. Obnovte stránku a zkuste to znovu.</p> : null}
            {saveState === "dirty" ? <p className="mt-3 text-xs font-semibold text-[#735600]">Neuložené změny</p> : null}
            {saveState === "saving" ? <p className="mt-3 text-xs font-semibold text-[#555]">Ukládám…</p> : null}
            {saveState === "saved" ? <p className="mt-3 text-xs font-semibold text-[#24613a]">Uloženo. Nastavení platí pro zákaznický chat.</p> : null}
            {saveState === "error" && saveErrorKind === "conflict" ? <p className="mt-3 text-xs font-semibold leading-4 text-[#b00000]">Nastavení mezitím změnil jiný administrátor. Načetli jsme aktuální verzi a zachovali vaše změny. Před uložením je zkontrolujte.</p> : null}
            {saveState === "error" && saveErrorKind !== "conflict" ? <p className="mt-3 text-xs font-semibold leading-4 text-[#b00000]">Změny se nepodařilo uložit. Zákaznický chat používá poslední uložené nastavení.</p> : null}
          </section>

          <div className={`space-y-5 ${configLoadState !== "ready" ? "pointer-events-none opacity-60" : ""}`} inert={configLoadState !== "ready"} aria-disabled={configLoadState !== "ready"}>
            <section className={`rounded-2xl border p-4 ${config.operatorAvailability === "online" ? "border-[#a8d9b7] bg-[#f3fbf5]" : config.operatorAvailability === "offline" ? "border-[#d5d5d5] bg-[#f7f7f7]" : "border-[#ecd17f] bg-[#fffbec]"}`}>
              <div className="flex items-center gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${config.operatorAvailability === "online" ? "bg-[#dff2e5] text-[#16853e]" : config.operatorAvailability === "offline" ? "bg-[#e7e7e7] text-[#555]" : "bg-[#fff0bd] text-[#8a6800]"}`}><UserRound size={20} /></span><div><div className="text-sm font-extrabold">Dostupnost operátora</div><div className="mt-0.5 text-[11px] font-semibold">{operatorStatusLabel}</div><div className="mt-0.5 text-[10px] leading-4 text-[#666]">Po uložení se stav zobrazí v zákaznickém chatu.</div></div></div>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1" role="group" aria-label="Nastavit dostupnost operátora">{(["unknown", "online", "offline"] as OperatorAvailability[]).map((state) => <button key={state} type="button" aria-pressed={config.operatorAvailability === state} onClick={() => updateAdminConfig((value) => ({ ...value, operatorAvailability: state }))} className={`rounded-lg px-1 py-2 text-[10px] font-bold ${config.operatorAvailability === state ? "bg-white shadow-sm" : "text-[#666]"}`}>{state === "unknown" ? "Neznámá" : state === "online" ? "Dostupný" : "Nedostupný"}</button>)}</div>
            </section>

            <section className="rounded-2xl border border-[#e1e1e1] p-4">
              <h2 className="text-sm font-extrabold">Chování asistenta</h2>
              <label className="mt-3 block text-xs font-bold">Uvítací text<input type="text" maxLength={300} value={adminConfig.copy.welcome} onChange={(event) => updateAdminConfig((value) => ({ ...value, copy: { ...value.copy, welcome: event.target.value } }))} className="mt-1 h-10 w-full rounded-lg border border-[#ccc] bg-white px-2 text-xs" /></label>
              <label className="mt-3 block text-xs font-bold">Model<select value={adminConfig.runtime.model} onChange={(event) => updateAdminConfig((value) => { const model = event.target.value as TobiConfig["runtime"]["model"]; return { ...value, runtime: { ...value.runtime, model, reasoningEffort: modelSupportsReasoning(model) ? value.runtime.reasoningEffort ?? "medium" : null, temperature: modelSupportsTemperature(model) ? value.runtime.temperature ?? 0.4 : null } }; })} className="mt-1 h-10 w-full rounded-lg border border-[#ccc] bg-white px-2 text-xs font-semibold"><option value="gpt-6-astra">gpt-6-astra</option><option value="gpt-6.1-sol">gpt-6.1-sol</option><option value="gpt-6-sol">gpt-6-sol</option><option value="gpt-4.1">gpt-4.1</option></select></label>
              {modelSupportsReasoning(adminConfig.runtime.model) ? <label className="mt-3 block text-xs font-bold">Reasoning effort<select value={adminConfig.runtime.reasoningEffort || "medium"} onChange={(event) => updateAdminConfig((value) => ({ ...value, runtime: { ...value.runtime, reasoningEffort: event.target.value as NonNullable<TobiConfig["runtime"]["reasoningEffort"]> } }))} className="mt-1 h-10 w-full rounded-lg border border-[#ccc] bg-white px-2 text-xs font-semibold"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label> : null}
              {modelSupportsTemperature(adminConfig.runtime.model) ? <label className="mt-3 block text-xs font-bold">Temperature<input type="number" min={0} max={2} step={0.1} value={adminConfig.runtime.temperature ?? 0.4} onChange={(event) => updateAdminConfig((value) => ({ ...value, runtime: { ...value.runtime, temperature: Math.min(2, Math.max(0, Number(event.target.value) || 0)) } }))} className="mt-1 h-10 w-full rounded-lg border border-[#ccc] bg-white px-2 text-xs" /></label> : null}
              <label className="mt-3 block text-xs font-bold">Max. výstupních tokenů<input type="number" min={100} max={4000} step={100} value={adminConfig.runtime.maxOutputTokens} onChange={(event) => updateAdminConfig((value) => ({ ...value, runtime: { ...value.runtime, maxOutputTokens: Math.min(4000, Math.max(100, Number(event.target.value) || 100)) } }))} className="mt-1 h-10 w-full rounded-lg border border-[#ccc] bg-white px-2 text-xs" /></label>
              <label className="mt-3 block text-xs font-bold">Systémový prompt<textarea rows={6} maxLength={12000} value={adminConfig.runtime.systemPrompt} onChange={(event) => updateAdminConfig((value) => ({ ...value, runtime: { ...value.runtime, systemPrompt: event.target.value } }))} className="mt-1 w-full resize-y rounded-lg border border-[#ccc] bg-white p-2 text-xs leading-4" /></label>
              <div className="mt-3 border-t border-[#eee] pt-3"><p className="text-xs font-bold">Znalostní zdroje</p><div className="mt-2 grid gap-2">{([['localIndex','Lokální index Vodafone.cz'],['presetKnowledge','Přednastavené znalosti'],['webSearch','Aktuální webové vyhledávání']] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[#555]">{label}<Toggle checked={adminConfig.runtime.sources[key]} onChange={() => updateAdminConfig((value) => ({ ...value, runtime: { ...value.runtime, sources: { ...value.runtime.sources, [key]: !value.runtime.sources[key] } } }))} label={label} /></label>)}</div></div>
            </section>

            <section className="rounded-2xl border border-[#e1e1e1] p-4">
              <div className="py-1"><div className="text-xs font-bold">Major Incident v zákaznickém chatu</div><div className="mt-0.5 text-[10px] text-[#777]">Globální zobrazení ověřeného incidentu</div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1">{([false, true] as const).map((enabled) => <button key={String(enabled)} type="button" onClick={() => updateAdminConfig((value) => ({ ...value, features: { ...value.features, majorIncident: enabled } }))} className={`rounded-lg px-1 py-2 text-[10px] font-bold ${config.features.majorIncident === enabled ? "bg-white shadow-sm" : "text-[#666]"}`}>{enabled ? "Ano" : "Ne"}</button>)}</div></div>
              <div className="mt-3 border-t border-[#eee] pt-3"><div className="text-xs font-bold">Simulace incidentu</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#777]">Pouze tento náhled</div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1">{([false, true] as const).map((enabled) => <button key={String(enabled)} type="button" onClick={() => { setIncidentDismissed(false); setRuntime((value) => ({ ...value, activeIncident: enabled ? demoMajorIncident : null, incidentMatch: "unknown" })); }} className={`rounded-lg px-1 py-2 text-[10px] font-bold ${Boolean(runtime.activeIncident) === enabled ? "bg-white shadow-sm" : "text-[#666]"}`}>{enabled ? "Zapnutá" : "Vypnutá"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Ukázat zdroje</div><Toggle checked={config.features.sources} onChange={() => updateAdminConfig((value) => ({ ...value, features: { ...value.features, sources: !value.features.sources } }))} label="Ukázat zdroje" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between gap-3 py-1"><div><div className="text-xs font-bold">Diagnostika routeru z fotografie</div><div className="mt-0.5 text-[10px] text-[#777]">Jednorázové zpracování bez uložení</div></div><Toggle checked={config.features.routerPhotoDiagnostics} onChange={() => updateAdminConfig((value) => ({ ...value, features: { ...value.features, routerPhotoDiagnostics: !value.features.routerPhotoDiagnostics } }))} label="Povolit diagnostiku routeru z fotografie" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div className="text-xs font-bold">Ukázat časy</div><Toggle checked={config.features.timestamps} onChange={() => updateAdminConfig((value) => ({ ...value, features: { ...value.features, timestamps: !value.features.timestamps } }))} label="Ukázat časy zpráv" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="flex items-center justify-between py-1"><div><div className="text-xs font-bold">Ptát se na zpětnou vazbu</div><div className="mt-0.5 text-[10px] text-[#777]">Hodnocení užitečnosti odpovědi</div></div><Toggle checked={config.features.feedback} onChange={() => updateAdminConfig((value) => ({ ...value, features: { ...value.features, feedback: !value.features.feedback } }))} label="Ptát se na zpětnou vazbu" /></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Hlavička Vodafone</div><div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[#eee] p-1">{(["white", "red"] as const).map((headerStyle) => <button key={headerStyle} type="button" onClick={() => updateAdminConfig((value) => ({ ...value, brand: { ...value.brand, headerStyle } }))} className={`rounded-lg px-1 py-2 text-[10px] font-bold ${config.brand.headerStyle === headerStyle ? "bg-white shadow-sm" : "text-[#666]"}`}>{headerStyle === "white" ? "Bílá" : "Červená"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Ikona TOBi</div><div className="mt-2 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Ikona TOBi">{(["sparkles", "vodafone", "ai-modern"] as TobiBrandIconVariant[]).map((iconVariant) => <button key={iconVariant} type="button" role="radio" aria-checked={config.brand.iconVariant === iconVariant} onClick={() => updateAdminConfig((value) => ({ ...value, brand: { ...value.brand, iconVariant } }))} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[9px] font-bold ${config.brand.iconVariant === iconVariant ? "border-[#e60000] bg-[#fff4f4] text-[#bd0000] ring-1 ring-[#e60000]" : "border-[#ddd] bg-white text-[#666]"}`}><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#e60000]"><TobiBrandIcon variant={iconVariant} size={iconVariant === "sparkles" ? 23 : 28} /></span><span>{iconVariant === "sparkles" ? "Hvězdičky" : iconVariant === "vodafone" ? "TOBi Vodafone" : "TOBi AI"}</span></button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1"><div className="text-xs font-bold">Prezentace kroků</div><div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#eee] p-1">{(["carousel", "cards", "list"] as const).map((renderMode) => <button key={renderMode} type="button" onClick={() => updateAdminConfig((value) => ({ ...value, presentation: { ...value.presentation, renderMode } }))} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${config.presentation.renderMode === renderMode ? "bg-white shadow-sm" : "text-[#666]"}`}>{renderMode === "carousel" ? "Carousel" : renderMode === "cards" ? "Karty" : "Seznam"}</button>)}</div></div>
              <div className="my-3 border-t border-[#eee]" />
              <div className="py-1">
                <div className="text-xs font-bold">Úvodní obrazovka · doporučená témata</div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#eee] p-1">{(["none", "list", "carousel"] as const).map((displayMode) => <button key={displayMode} type="button" onClick={() => updateAdminConfig((value) => ({ ...value, presentation: { ...value.presentation, intro: { ...value.presentation.intro, displayMode } } }))} className={`rounded-lg px-1 py-2 text-[9px] font-bold ${config.presentation.intro.displayMode === displayMode ? "bg-white shadow-sm" : "text-[#666]"}`}>{displayMode === "none" ? "Bez" : displayMode === "list" ? "Seznam" : "Carousel"}</button>)}</div>
                <label className={`mt-3 flex items-center justify-between gap-3 ${config.presentation.intro.displayMode === "none" ? "opacity-55" : ""}`}><span><span className="block text-xs font-bold">Počet tipů</span><span className="mt-0.5 block text-[10px] text-[#777]">1 až 10 · pro seznam i carousel</span></span><input type="number" min={1} max={10} disabled={config.presentation.intro.displayMode === "none"} value={config.presentation.intro.visibleTopicsCount} onChange={(event) => updateAdminConfig((value) => ({ ...value, presentation: { ...value.presentation, intro: { ...value.presentation.intro, visibleTopicsCount: Math.min(10, Math.max(1, Number(event.target.value) || 1)) } } }))} className="h-9 w-14 rounded-lg border border-[#ccc] bg-white text-center text-sm font-bold disabled:cursor-not-allowed disabled:bg-[#f3f3f3]" aria-label="Počet úvodních tipů" /></label>

                <label htmlFor="intro-helper-text" className="mt-4 block text-xs font-bold">Doprovodný text</label>
                <textarea
                  id="intro-helper-text"
                  ref={introHelperTextRef}
                  rows={4}
                  value={adminConfig.presentation.intro.helperText}
                  onChange={(event) => updateAdminConfig((value) => ({ ...value, presentation: { ...value.presentation, intro: { ...value.presentation.intro, helperText: event.target.value } } }))}
                  onBlur={() => setIntroHelperTextTouched(true)}
                  aria-invalid={introHelperTextTouched && !introHelperMarkupValidation.success}
                  aria-describedby={`intro-helper-help intro-helper-example intro-helper-count${introHelperTextTouched && !introHelperMarkupValidation.success ? " intro-helper-error" : ""}`}
                  className="mt-1 w-full resize-y rounded-lg border border-[#ccc] bg-white p-2 text-xs leading-4 aria-[invalid=true]:border-[#b00000] aria-[invalid=true]:outline aria-[invalid=true]:outline-1 aria-[invalid=true]:outline-[#b00000]"
                />
                <p id="intro-helper-help" className="mt-1 text-[10px] leading-4 text-[#666]">Tučný text zapište jako **text**, odkaz jako [text odkazu](https://…). Můžete vložit až 8 odkazů. Nový řádek vložte klávesou Enter. Pokud pole necháte prázdné, doprovodný text se nezobrazí.</p>
                <p id="intro-helper-example" className="mt-1 break-words text-[10px] leading-4 text-[#777]">Příklad: **Tip:** Podívejte se na [Centrum péče](https://www.vodafone.cz/pece/) nebo [výpadky](https://www.vodafone.cz/vypadky/).</p>
                <p id="intro-helper-count" className={`mt-1 text-right text-[10px] font-semibold ${adminConfig.presentation.intro.helperText.length > INTRO_HELPER_MAX_LENGTH ? "text-[#b00000]" : "text-[#777]"}`}>{adminConfig.presentation.intro.helperText.length.toLocaleString("cs-CZ")} / 1 000 znaků</p>
                {introHelperTextTouched && !introHelperMarkupValidation.success ? <p id="intro-helper-error" role="alert" className="mt-1 text-[10px] font-semibold leading-4 text-[#b00000]">{introHelperMarkupValidation.error.message}</p> : null}

                <fieldset className="mt-4">
                  <legend className="text-xs font-bold">Umístění uvítání a doprovodného textu</legend>
                  <div className="mt-2 grid gap-2">
                    {(["top", "bottom"] as const).map((placement) => <label key={placement} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#ddd] px-3 text-[11px] font-semibold text-[#555]"><input type="radio" name="intro-helper-placement" value={placement} checked={adminConfig.presentation.intro.helperTextPlacement === placement} onChange={() => updateAdminConfig((value) => ({ ...value, presentation: { ...value.presentation, intro: { ...value.presentation.intro, helperTextPlacement: placement } } }))} className="h-4 w-4 accent-[#e60000]" />{placement === "top" ? "Nahoře" : "Dole nad polem pro zprávu"}</label>)}
                  </div>
                </fieldset>
              </div>
              <div className="mt-3 border-t border-[#eee] pt-2"><div className="text-xs font-bold">Tlačítka v liště</div><div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">{([['agent','Agent'],['newRequest','Nový požadavek'],['minimize','Minimalizace'],['close','Zavřít (X)'] ] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between text-[10px] text-[#555]">{label}<Toggle checked={config.headerActions[key]} onChange={() => updateAdminConfig((value) => ({ ...value, headerActions: { ...value.headerActions, [key]: !value.headerActions[key] } }))} label={`Zobrazit ${label}`} /></label>)}</div></div>
            </section>

            <details className="rounded-2xl border border-[#e1e1e1] bg-white p-3"><summary className="cursor-pointer text-xs font-extrabold text-[#333]">Spustit zákaznický scénář</summary><nav className="mt-2 grid gap-1" aria-label="Testovací scénáře"><button type="button" onClick={requestHandoff} disabled={runtime.handoverState !== "bot_active"} className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[#e60000]"><UserRound size={14} /></span><span className="min-w-0 flex-1 truncate">Mock operátor</span><ChevronRight size={14} className="text-[#999]" /></button>{topics.map((topic) => { const Icon = topicIcons[topic.icon as keyof typeof topicIcons] || CircleHelp; return <button key={topic.id} type="button" onClick={() => startTopic(topic.prompt)} className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold hover:bg-[#f5f5f5]"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f0f0f0] text-[#555]"><Icon size={14} /></span><span className="min-w-0 flex-1 truncate">{topic.label}</span><ChevronRight size={14} className="text-[#999]" /></button>; })}</nav></details>
          </div>
        </aside> : null}
      </div>
    </main>
  );
}
