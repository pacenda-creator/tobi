"use client";

import { Fragment, type ReactNode, useMemo } from "react";
import { ChevronDown, CircleHelp, ExternalLink } from "lucide-react";

import { planChatBlockPresentationV1 } from "@/components/tobi/chat-block-presentation";
import { MediaCarousel } from "@/components/tobi/media-carousel";
import { TariffComparison } from "@/components/tobi/tariff-comparison";
import { getVisibleChatSources } from "@/lib/chat-source-visibility";
import type { ChatResponseV1, UiBlockV1 } from "@/lib/contracts/chat/v1";
import type { RenderMode } from "@/lib/tobi-config";

type AlertBlock = Extract<UiBlockV1, { type: "alert" }>;
type ActionBlock = Extract<UiBlockV1, { type: "action" }>;

type RenderContext = {
  response: ChatResponseV1;
  companions: UiBlockV1[];
  sourceIds?: string[];
  showPresetSources: boolean;
  renderMode: RenderMode;
  loop: boolean;
  wideBreakpoint: number;
  busy: boolean;
  onSendMessage: (message: string, label: string, transitionId?: string) => void;
  onRequestUpload: () => void;
};

type BlockRenderer = (block: UiBlockV1, context: RenderContext) => ReactNode;

function AlertView({ block }: { block: AlertBlock }) {
  const colors = block.severity === "error"
    ? "bg-[#fff5f5] text-[#a00000]"
    : block.severity === "info"
      ? "bg-[#f3f3f3] text-[#555]"
      : "bg-[#fff6df] text-[#695015]";
  return <div className={`mt-3 flex gap-2 rounded-xl p-3 text-[11px] leading-4 ${colors}`}>
    <CircleHelp size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div>{block.title ? <p className="font-bold">{block.title}</p> : null}<p>{block.text}</p></div>
  </div>;
}

function ActionView({ block, busy, onSendMessage, onRequestUpload }: { block: ActionBlock; busy: boolean; onSendMessage: (message: string, label: string, transitionId?: string) => void; onRequestUpload: () => void }) {
  const appearance = block.appearance ?? "primary";
  const className = appearance === "primary"
    ? "mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-[#e60000] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#bd0000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc] disabled:cursor-not-allowed disabled:opacity-50"
    : appearance === "toggle"
      ? "mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#bbb] bg-white px-4 py-2.5 text-xs font-bold text-[#333] transition hover:border-[#e60000] hover:text-[#bd0000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc] disabled:cursor-not-allowed disabled:opacity-50"
      : "mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-[#bbb] bg-white px-4 py-2.5 text-xs font-bold text-[#444] transition hover:border-[#777] hover:text-[#111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc] disabled:cursor-not-allowed disabled:opacity-50";
  if (block.action.kind === "openUrl") {
    return <a href={block.action.url} target={block.action.external ? "_blank" : undefined} rel={block.action.external ? "noreferrer" : undefined} className={`${className} gap-2`}>{block.label} {block.action.external ? <ExternalLink size={13} aria-hidden="true" /> : null}</a>;
  }
  if (block.action.kind === "requestUpload") {
    return <button type="button" disabled={busy} onClick={onRequestUpload} className={className}>{block.label}</button>;
  }
  const message = block.action.message;
  const transitionId = block.action.transitionId;
  return <button type="button" disabled={busy} onClick={() => onSendMessage(message, block.label, transitionId)} className={className}>{block.label}</button>;
}

export const CHAT_BLOCK_RENDERER_REGISTRY = {
  steps: ((block, context) => {
    if (block.type !== "steps") return null;
    return <section className="mt-3 rounded-2xl border border-[#dedede] bg-white p-4">
      {block.title ? <h3 className="text-base font-extrabold text-[#222]">{block.title}</h3> : null}
      <ol className="mt-3 grid gap-2">
        {block.items.map((step, stepIndex) => <li key={step.id} className="flex items-start gap-3 rounded-xl bg-[#fafafa] p-3 text-xs leading-5 text-[#444]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[11px] font-extrabold text-[#bd0000]">{stepIndex + 1}</span><span>{step.text}</span></li>)}
      </ol>
      {context.companions.map((companion) => companion.type === "alert"
        ? <AlertView key={companion.id} block={companion} />
        : companion.type === "action"
          ? <ActionView key={companion.id} block={companion} busy={context.busy} onSendMessage={context.onSendMessage} onRequestUpload={context.onRequestUpload} />
          : null)}
    </section>;
  }) satisfies BlockRenderer,

  alert: ((block) => block.type === "alert" ? <AlertView block={block} /> : null) satisfies BlockRenderer,

  infoCard: ((block) => block.type === "infoCard"
    ? <section className="mt-3 rounded-2xl border border-[#dedede] bg-white p-4"><h3 className="text-base font-extrabold text-[#222]">{block.title}</h3><p className="mt-2 text-xs leading-5 text-[#555]">{block.text}</p></section>
    : null) satisfies BlockRenderer,

  action: ((block, context) => block.type === "action"
    ? <ActionView block={block} busy={context.busy} onSendMessage={context.onSendMessage} onRequestUpload={context.onRequestUpload} />
    : null) satisfies BlockRenderer,

  mediaCards: ((block, context) => block.type === "mediaCards"
    ? <div className="mt-2"><MediaCarousel
        cards={block.cards.map((card) => ({
          id: card.id,
          title: card.title,
          description: card.description,
          image: card.image.src,
          imageAlt: card.image.alt,
          actionLabel: card.action?.label,
          actionUrl: card.action?.action.kind === "openUrl" ? card.action.action.url : undefined,
          external: card.action?.action.kind === "openUrl" ? card.action.action.external : false,
          actionMessage: card.action?.action.kind === "sendMessage" ? card.action.action.message : undefined,
          actionTransitionId: card.action?.action.kind === "sendMessage" ? card.action.action.transitionId : undefined,
        }))}
        presentation={block.presentation}
        mode={context.renderMode}
        loop={context.loop}
        wideBreakpoint={context.wideBreakpoint}
        busy={context.busy}
        onSendMessage={context.onSendMessage}
      /></div>
    : null) satisfies BlockRenderer,

  tariffComparison: ((block) => block.type === "tariffComparison"
    ? <TariffComparison block={block} />
    : null) satisfies BlockRenderer,

  sourceList: ((block, context) => {
    if (block.type !== "sourceList") return null;
    const sources = getVisibleChatSources({
      showSources: context.showPresetSources,
      sources: context.response.sources,
      blockSourceIds: block.sourceIds,
      presentationSourceIds: context.sourceIds,
    });
    if (!sources.length) return null;
    return <details className="group mt-2 text-[11px] text-[#777]"><summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 font-semibold hover:text-[#333]"><span>Zdroje · {sources.length}</span><ChevronDown size={13} className="transition group-open:rotate-180" /></summary><div className="mt-1 space-y-1 border-l border-[#ddd] pl-3">{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 py-1 text-[#666] underline decoration-[#bbb] underline-offset-2 hover:text-[#222]"><span className="min-w-0 flex-1">{source.title}</span><ExternalLink size={11} className="shrink-0" aria-hidden="true" /></a>)}</div></details>;
  }) satisfies BlockRenderer,
} satisfies Record<UiBlockV1["type"], BlockRenderer>;

type ChatBlockRendererProps = {
  response: ChatResponseV1;
  preferMedia: boolean;
  showPresetSources: boolean;
  renderMode: RenderMode;
  loop: boolean;
  wideBreakpoint: number;
  busy: boolean;
  onSendMessage: (message: string, label: string, transitionId?: string) => void;
  onRequestUpload: () => void;
};

export function ChatBlockRenderer({ response, preferMedia, showPresetSources, renderMode, loop, wideBreakpoint, busy, onSendMessage, onRequestUpload }: ChatBlockRendererProps) {
  const units = useMemo(
    () => planChatBlockPresentationV1(response.blocks, response.intent.id, preferMedia),
    [preferMedia, response.blocks, response.intent.id],
  );

  return <>{units.map((unit) => {
    const render = CHAT_BLOCK_RENDERER_REGISTRY[unit.block.type];
    return <Fragment key={unit.key}>{render(unit.block, {
      response,
      companions: unit.companions,
      sourceIds: unit.sourceIds,
      showPresetSources,
      renderMode,
      loop,
      wideBreakpoint,
      busy,
      onSendMessage,
      onRequestUpload,
    })}</Fragment>;
  })}</>;
}
