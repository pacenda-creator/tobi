"use client";

import { ChevronLeft, ChevronRight, Globe2, KeyRound, QrCode, ReceiptText, Router, Signal, Smartphone, Tv, WalletCards, Wifi } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { getCarouselCardBasis, getCarouselVisibleCount } from "@/lib/carousel-layout";
import type { IntroUseCase } from "@/lib/tobi-config";

const icons = { "key-round": KeyRound, router: Router, tv: Tv, "receipt-text": ReceiptText, "qr-code": QrCode, globe: Globe2, signal: Signal, wifi: Wifi, smartphone: Smartphone, "wallet-cards": WalletCards };

export function CapabilityCarousel({ items, onSelect, wideBreakpoint = 520 }: { items: IntroUseCase[]; onSelect: (prompt: string) => void; wideBreakpoint?: number }) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop: false, duration: 22 });
  const containerRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(items.length > 1);
  const [snapCount, setSnapCount] = useState(items.length);
  const selectedItemIdRef = useRef(items[0]?.id);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateLayout = (width: number) => setContainerWidth(width);
    updateLayout(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => updateLayout(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [wideBreakpoint]);

  const sync = useCallback(() => {
    if (!emblaApi) return;
    const nextSelected = emblaApi.selectedScrollSnap();
    setSelected(nextSelected);
    selectedItemIdRef.current = items[nextSelected]?.id;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
    setSnapCount(emblaApi.scrollSnapList().length);
  }, [emblaApi, items]);

  useEffect(() => {
    if (!emblaApi) return;
    const frame = requestAnimationFrame(sync);
    emblaApi.on("select", sync).on("reInit", sync);
    return () => { cancelAnimationFrame(frame); emblaApi.off("select", sync).off("reInit", sync); };
  }, [emblaApi, sync]);

  const minCardWidth = Math.min(170, Math.max(150, Math.floor(wideBreakpoint / 2)));
  const visibleCount = getCarouselVisibleCount({ containerWidth, itemCount: items.length, minCardWidth });
  useEffect(() => {
    if (!emblaApi) return;
    const previousId = selectedItemIdRef.current;
    emblaApi.reInit();
    const targetIndex = Math.max(0, previousId ? items.findIndex((item) => item.id === previousId) : 0);
    emblaApi.scrollTo(Math.min(targetIndex, Math.max(0, items.length - visibleCount)), true);
    const frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [emblaApi, items, sync, visibleCount]);
  const visibleStart = Math.min(selected, Math.max(0, items.length - visibleCount));
  const visibleEnd = Math.min(items.length - 1, visibleStart + visibleCount - 1);
  const announcement = visibleStart === visibleEnd ? `Zobrazen příklad ${visibleStart + 1} ze ${items.length}` : `Zobrazeny příklady ${visibleStart + 1} až ${visibleEnd + 1} ze ${items.length}`;
  const showControls = snapCount > 1;
  const cardBasis = getCarouselCardBasis(visibleCount);
  const compact = visibleCount >= 2;
  const cardClassName = `flex h-full w-full flex-col items-start rounded-[var(--tobi-radius-card)] border border-[#dedede] bg-white text-left transition hover:border-[#c8c8c8] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#e60000] ${compact ? "min-h-44 p-3" : "min-h-[196px] p-4"}`;

  return <section ref={containerRef} aria-label="Příklady, s čím TOBi pomůže" aria-roledescription={showControls ? "carousel" : undefined}>
    <div className="mb-3 flex min-h-11 items-end justify-between gap-4">
      <p className="pb-1 text-[15px] leading-[22px] text-[#666]">{containerWidth < 520 ? "Vyberte téma" : "Pomohu vám například s těmito tématy:"}</p>
      {showControls ? <div className="flex shrink-0 gap-2"><button type="button" data-tobi-focus-key="intro-carousel-prev" onClick={() => emblaApi?.scrollPrev(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canPrev} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:cursor-default disabled:opacity-35" aria-label="Předchozí témata"><ChevronLeft size={20} aria-hidden="true" /></button><button type="button" data-tobi-focus-key="intro-carousel-next" onClick={() => emblaApi?.scrollNext(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canNext} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:cursor-default disabled:opacity-35" aria-label="Další témata"><ChevronRight size={20} aria-hidden="true" /></button></div> : null}
    </div>
    <div ref={viewportRef} className="overflow-hidden py-0.5">
      <div className="flex touch-pan-y items-stretch gap-3">{items.map((item, index) => {
        const Icon = icons[item.icon as keyof typeof icons] || Router;
        const visible = index >= visibleStart && index <= visibleEnd;
        return <div key={item.id} className="min-w-0 shrink-0" style={{ flexBasis: cardBasis }} role="group" aria-roledescription={showControls ? "karta" : undefined} aria-label={`${index + 1} ze ${items.length}`} aria-hidden={!visible} inert={!visible}><button type="button" data-tobi-focus-key={`intro-topic:${item.id}`} onClick={() => onSelect(item.prompt)} className={cardClassName}><span className={`grid shrink-0 place-items-center rounded-full bg-[#fff0f0] text-[#e60000] ${compact ? "h-10 w-10" : "h-12 w-12"}`} aria-hidden="true"><Icon size={compact ? 20 : 24} /></span><span className={`block font-semibold text-[#222] ${compact ? "mt-3 text-sm leading-[19px]" : "mt-4 text-[15px] leading-5"}`}>{item.label}</span><span className={`block text-[#666] ${compact ? "mt-1.5 text-[13px] leading-[18px]" : "mt-2 text-sm leading-5"}`}>{item.detail}</span></button></div>;
      })}</div>
    </div>
    {showControls ? <p className="sr-only" aria-live="polite">{announcement}</p> : null}
    {showControls ? <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">{Array.from({ length: snapCount }, (_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === selected ? "w-4 bg-[#e60000]" : "w-1.5 bg-[#c8c8c8]"}`} />)}</div> : null}
  </section>;
}
