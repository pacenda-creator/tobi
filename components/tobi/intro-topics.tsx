"use client";

import { ChevronDown, ChevronRight, ChevronUp, KeyRound, ReceiptText, Router, Tv } from "lucide-react";
import { useId, useState } from "react";

import type { IntroUseCase } from "@/lib/tobi-config";

const icons = { "key-round": KeyRound, router: Router, tv: Tv, "receipt-text": ReceiptText };

export function IntroTopics({
  items,
  initialVisibleCount = 3,
  onSelect,
}: {
  items: IntroUseCase[];
  initialVisibleCount?: number;
  onSelect: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const extraTopicsId = useId();
  const visibleCount = Math.max(0, initialVisibleCount);
  const primaryItems = items.slice(0, visibleCount);
  const extraItems = items.slice(visibleCount);
  const hasMore = items.length > visibleCount;

  function renderTopic(item: IntroUseCase) {
    const Icon = icons[item.icon as keyof typeof icons] || Router;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.prompt)}
        className="group flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-[#dedede] bg-white px-3 py-1.5 text-left transition hover:border-[#c5c5c5] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[#e60000]" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-[#222]">{item.label}</span>
        <ChevronRight size={18} className="shrink-0 text-[#666] transition group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section aria-label="Doporučená témata">
      {primaryItems.length ? <div className="grid gap-2">{primaryItems.map(renderTopic)}</div> : null}

      {hasMore ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={extraTopicsId}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#444] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
        >
          {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          {expanded ? "Méně možností" : "Další možnosti"}
        </button>
      ) : null}
      {hasMore ? <div id={extraTopicsId} hidden={!expanded} className="mt-1 grid gap-2">{extraItems.map(renderTopic)}</div> : null}
    </section>
  );
}
