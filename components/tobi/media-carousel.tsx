"use client";

import { ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

import { getCarouselCardBasis, getCarouselVisibleCount } from "@/lib/carousel-layout";
import type { MediaCard, RenderMode } from "@/lib/tobi-config";

type CarouselMediaCard = MediaCard & { actionMessage?: string };

type MediaCarouselProps = {
  cards: CarouselMediaCard[];
  mode: RenderMode;
  loop?: boolean;
  wideBreakpoint?: number;
  busy?: boolean;
  onSendMessage?: (message: string, label: string) => void;
};

function Card({ card, step, compact = false, list = false, busy = false, onSendMessage }: { card: CarouselMediaCard; step: number; compact?: boolean; list?: boolean; busy?: boolean; onSendMessage?: (message: string, label: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (list) {
    return (
      <article className="flex min-h-20 items-center gap-3 rounded-xl border border-[#dddddd] bg-white p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fff0f0] text-xs font-extrabold text-[#bd0000]" aria-hidden="true">{step}</span>
        <div className="relative h-10 w-10 shrink-0 rounded-lg bg-[#f7f7f7]">
          {imageFailed ? <div role="img" aria-label={card.imageAlt} className="grid h-full place-items-center text-[#777]"><ImageOff className="h-4 w-4" aria-hidden="true" /></div> : <Image src={card.image} alt={card.imageAlt} fill sizes="40px" style={{ objectFit: "contain" }} onError={() => setImageFailed(true)} />}
        </div>
        <div className="min-w-0 flex-1"><h3 className="text-sm font-bold leading-5 text-[#222]">{card.title}</h3><p className="mt-0.5 text-xs leading-4 text-[#666]">{card.description}</p></div>
        {card.actionLabel && card.actionUrl ? <a href={card.actionUrl} target={card.external ? "_blank" : undefined} rel={card.external ? "noreferrer" : undefined} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#222] px-3 text-xs font-bold text-[#222] hover:bg-[#f3f3f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]" aria-label={card.external ? `${card.actionLabel}, otevře se na externím webu` : card.actionLabel}>{card.actionLabel}{card.external ? <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> : null}</a> : card.actionLabel && card.actionMessage ? <button type="button" disabled={busy} onClick={() => onSendMessage?.(card.actionMessage!, card.actionLabel!)} className="min-h-10 shrink-0 rounded-full border border-[#222] px-3 text-xs font-bold text-[#222] hover:bg-[#f3f3f3] disabled:opacity-50">{card.actionLabel}</button> : null}
      </article>
    );
  }
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#dddddd] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]">
      <div className={`flex flex-1 flex-col gap-2 ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-center gap-3">
          <div className={`relative shrink-0 rounded-xl bg-[#f7f7f7] ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
            {imageFailed ? (
              <div role="img" aria-label={card.imageAlt} className="grid h-full place-items-center text-[#777]"><ImageOff className="h-5 w-5" aria-hidden="true" /></div>
            ) : (
              <Image src={card.image} alt={card.imageAlt} fill sizes={compact ? "40px" : "48px"} style={{ objectFit: "contain" }} onError={() => setImageFailed(true)} />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold leading-4 text-[#777]">Krok {step}</span>
            <h3 className="mt-0.5 text-[15px] font-bold leading-5 text-[#222]">{card.title}</h3>
          </div>
        </div>
        <p className="text-sm leading-5 text-[#555]">{card.description}</p>
        {card.actionLabel && card.actionUrl ? (
          <a
            href={card.actionUrl}
            target={card.external ? "_blank" : undefined}
            rel={card.external ? "noreferrer" : undefined}
            className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#222] px-4 py-2 text-center text-sm font-bold text-[#222] transition hover:bg-[#f3f3f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
            aria-label={card.external ? `${card.actionLabel}, otevře se na externím webu` : card.actionLabel}
          >
            {card.actionLabel}
            {card.external ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : null}
          </a>
        ) : card.actionLabel && card.actionMessage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSendMessage?.(card.actionMessage!, card.actionLabel!)}
            className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#222] px-4 py-2 text-center text-sm font-bold text-[#222] transition hover:bg-[#f3f3f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {card.actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function MediaCarousel({ cards, mode, loop = false, wideBreakpoint = 520, busy = false, onSendMessage }: MediaCarouselProps) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop });
  const containerRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(cards.length > 1);
  const minCardWidth = Math.min(170, Math.max(150, Math.floor(wideBreakpoint / 2)));
  const visibleCount = getCarouselVisibleCount({ containerWidth, itemCount: cards.length, minCardWidth });
  const visibleIndices = Array.from({ length: visibleCount }, (_, offset) => loop
    ? (selected + offset) % cards.length
    : Math.min(cards.length - 1, selected + offset));
  const visibleIndexSet = new Set(visibleIndices);
  const positionLabel = visibleIndices.length === 1
    ? `Zobrazen krok ${visibleIndices[0] + 1} ze ${cards.length}`
    : `Zobrazeny kroky ${visibleIndices.map((index) => index + 1).join(" a ")} ze ${cards.length}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setContainerWidth(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [wideBreakpoint]);

  useEffect(() => { emblaApi?.reInit(); }, [emblaApi, visibleCount]);

  const sync = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const frame = requestAnimationFrame(sync);
    emblaApi.on("select", sync).on("reInit", sync);
    return () => {
      cancelAnimationFrame(frame);
      emblaApi.off("select", sync).off("reInit", sync);
    };
  }, [emblaApi, sync]);

  if (!cards.length) return null;

  if (mode !== "carousel") {
    return (
      <div className="@container">
        {mode === "list" ? <ol className="grid gap-2">{cards.map((card, index) => <li key={card.id}><Card card={card} step={index + 1} list busy={busy} onSendMessage={onSendMessage} /></li>)}</ol> : <div className="grid gap-3 @min-[520px]:grid-cols-2">{cards.map((card, index) => <Card key={card.id} card={card} step={index + 1} busy={busy} onSendMessage={onSendMessage} />)}</div>}
      </div>
    );
  }

  return (
    <section ref={containerRef} className="@container" aria-label="Doporučený postup">
      {cards.length > visibleCount ? <div className="sticky top-0 z-10 mb-2 flex min-h-11 items-center justify-between gap-3 bg-white" aria-label="Navigace doporučeného postupu">
        <button type="button" onClick={() => emblaApi?.scrollPrev(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canPrev} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#cccccc] bg-white text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:opacity-35" aria-label="Předchozí karta">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 text-center">
          <span className="text-xs font-bold text-[#555]" aria-live="polite">{positionLabel}</span>
          <div className="mt-1 flex justify-center gap-1.5" aria-hidden="true">
            {cards.map((card, index) => <span key={card.id} className={`h-1.5 rounded-full transition-all ${visibleIndexSet.has(index) ? "w-4 bg-[#e60000]" : "w-1.5 bg-[#c8c8c8]"}`} />)}
          </div>
        </div>
        <button type="button" onClick={() => emblaApi?.scrollNext(window.matchMedia("(prefers-reduced-motion: reduce)").matches)} disabled={!canNext} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#cccccc] bg-white text-[#222] transition hover:border-[#999] hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000] disabled:opacity-35" aria-label="Další karta">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div> : null}
      <div
        ref={viewportRef}
        className="overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (event.key === "ArrowLeft") { event.preventDefault(); emblaApi?.scrollPrev(reduceMotion); }
          if (event.key === "ArrowRight") { event.preventDefault(); emblaApi?.scrollNext(reduceMotion); }
        }}
        aria-roledescription="carousel"
      >
        <div className="flex touch-pan-y gap-3">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className="min-w-0 shrink-0"
              style={{ flexBasis: getCarouselCardBasis(visibleCount) }}
              role="group"
              aria-label={`${index + 1} z ${cards.length}`}
              aria-hidden={!visibleIndexSet.has(index)}
              inert={!visibleIndexSet.has(index)}
            >
              <Card card={card} step={index + 1} compact={visibleCount >= 2} busy={busy} onSendMessage={onSendMessage} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
