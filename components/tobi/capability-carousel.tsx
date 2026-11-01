"use client";

import { ChevronLeft, ChevronRight, KeyRound, ReceiptText, Router, Tv } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { IntroUseCase } from "@/lib/tobi-config";

const icons = { "key-round": KeyRound, router: Router, tv: Tv, "receipt-text": ReceiptText };

export function CapabilityCarousel({ items, onSelect, wideBreakpoint = 520 }: { items: IntroUseCase[]; onSelect: (prompt: string) => void; wideBreakpoint?: number }) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop: false, duration: 22 });
  const containerRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<"mobile" | "medium" | "wide">("mobile");
  const [containerWidth, setContainerWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(items.length > 1);
  const [snapCount, setSnapCount] = useState(items.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateLayout = (width: number) => {
      setContainerWidth(width);
      setLayout(width >= 680 ? "wide" : width >= wideBreakpoint ? "medium" : "mobile");
    };
    updateLayout(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => updateLayout(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [wideBreakpoint]);

  const sync = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
    setSnapCount(emblaApi.scrollSnapList().length);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const frame = requestAnimationFrame(sync);
    emblaApi.on("select", sync).on("reInit", sync);
    return () => { cancelAnimationFrame(frame); emblaApi.off("select", sync).off("reInit", sync); };
  }, [emblaApi, sync]);

  useEffect(() => {
    emblaApi?.reInit();
  }, [emblaApi, layout]);

  const visibleCount = layout === "wide" ? 4 : 2;
  const visibleStart = Math.min(selected, Math.max(0, items.length - visibleCount));
  const visibleEnd = Math.min(items.length - 1, visibleStart + visibleCount - 1);
  const announcement = visibleStart === visibleEnd ? `Zobrazen příklad ${visibleStart + 1} ze ${items.length}` : `Zobrazeny příklady ${visibleStart + 1} až ${visibleEnd + 1} ze ${items.length}`;
  const showControls = snapCount > 1;
  const mobileHasPeek = layout === "mobile" && containerWidth >= 320;
  const cardBasis = layout === "wide"
    ? "calc(25% - 9px)"
    : layout === "medium"
      ? "calc(50% - 6px)"
      : mobileHasPeek
        ? "calc((100% - 32px) / 2)"
        : "calc((100% - 8px) / 2)";
  const cardClassName = layout === "mobile"
    ? "flex h-full min-h-44 w-full flex-col items-start rounded-[var(--tobi-radius-card)] border border-[#dedede] bg-white p-3 text-left transition hover:border-[#c8c8c8] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#e60000]"
    : "flex h-full min-h-[196px] w-full flex-col items-start rounded-[var(--tobi-radius-card)] border border-[#dedede] bg-white p-4 text-left transition hover:border-[#c8c8c8] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#e60000]";

  return <section ref={containerRef} aria-label="Příklady, s čím TOBi pomůže" aria-roledescription={showControls ? "carousel" : undefined}>
    <div className="mb-3 flex min-h-11 items-end justify-between gap-4">
      <p className="pb-1 text-[15px] leading-[22px] text-[#666]">{layout === "mobile" ? "Vyberte téma" : "Pomohu vám například s těmito tématy:"}</p>
      {showControls ? <div className="flex shrink-0 gap-2"><button type="button" onClick={() => emblaApi?.scrollPrev(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canPrev} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:cursor-default disabled:opacity-35" aria-label="Předchozí témata"><ChevronLeft size={20} aria-hidden="true" /></button><button type="button" onClick={() => emblaApi?.scrollNext(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canNext} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:cursor-default disabled:opacity-35" aria-label="Další témata"><ChevronRight size={20} aria-hidden="true" /></button></div> : null}
    </div>
    <div ref={viewportRef} className="overflow-hidden py-0.5">
      <div className={`flex touch-pan-y items-stretch ${layout === "mobile" ? "gap-2" : "gap-3"}`}>{items.map((item, index) => {
        const Icon = icons[item.icon as keyof typeof icons] || Router;
        return <div key={item.id} className="min-w-0 shrink-0" style={{ flexBasis: cardBasis }} role="group" aria-roledescription={showControls ? "karta" : undefined} aria-label={`${index + 1} ze ${items.length}`}><button type="button" onClick={() => onSelect(item.prompt)} className={cardClassName}><span className={`grid shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[#e60000] ${layout === "mobile" ? "h-10 w-10" : "h-12 w-12"}`} aria-hidden="true"><Icon size={layout === "mobile" ? 20 : 24} /></span><span className={`block font-semibold text-[#222] ${layout === "mobile" ? "mt-3 text-sm leading-[19px]" : "mt-4 text-[15px] leading-5"}`}>{item.label}</span><span className={`block text-[#666] ${layout === "mobile" ? "mt-1.5 text-[13px] leading-[18px]" : "mt-2 text-sm leading-5"}`}>{item.detail}</span></button></div>;
      })}</div>
    </div>
    {showControls ? <p className="sr-only" aria-live="polite">{announcement}</p> : null}
    {showControls ? <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">{Array.from({ length: snapCount }, (_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === selected ? "w-4 bg-[#e60000]" : "w-1.5 bg-[#c8c8c8]"}`} />)}</div> : null}
  </section>;
}
