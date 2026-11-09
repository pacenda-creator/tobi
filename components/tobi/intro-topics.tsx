"use client";

import { ChevronRight, KeyRound, ReceiptText, Router, Tv } from "lucide-react";

import type { IntroUseCase } from "@/lib/tobi-config";

const icons = { "key-round": KeyRound, router: Router, tv: Tv, "receipt-text": ReceiptText };

export function IntroTopics({
  items,
  visibleCount = 3,
  onSelect,
}: {
  items: IntroUseCase[];
  visibleCount?: number;
  onSelect: (prompt: string) => void;
}) {
  const primaryItems = items.slice(0, Math.max(1, visibleCount));

  function renderTopic(item: IntroUseCase) {
    const Icon = icons[item.icon as keyof typeof icons] || Router;
    return (
      <button
        key={item.id}
        type="button"
        data-tobi-focus-key={`intro-topic:${item.id}`}
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

    </section>
  );
}
