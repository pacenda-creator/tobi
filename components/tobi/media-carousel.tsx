"use client";

import { ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

import type { MediaCard, RenderMode } from "@/lib/tobi-config";

type MediaCarouselProps = {
  cards: MediaCard[];
  mode: RenderMode;
  loop?: boolean;
  wideBreakpoint?: number;
};

function Card({ card, step }: { card: MediaCard; step: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#dddddd] bg-white shadow-[0_2px_8px_rgba(0,0,0,.04)]">
      <div className="relative h-24 bg-[#f7f7f7]">
        {imageFailed ? (
          <div role="img" aria-label={card.imageAlt} className="grid h-full place-items-center text-[#777]"><ImageOff className="h-8 w-8" aria-hidden="true" /></div>
        ) : (
          <Image src={card.image} alt={card.imageAlt} fill sizes="(max-width: 519px) 84vw, 320px" style={{ objectFit: "contain" }} onError={() => setImageFailed(true)} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs font-bold text-[#777]">Krok {step}</span>
        <h3 className="text-[15px] font-bold leading-5 text-[#222]">{card.title}</h3>
        <p className="text-sm leading-5 text-[#555]">{card.description}</p>
        {card.actionLabel && card.actionUrl ? (
          <a
            href={card.actionUrl}
            target={card.external ? "_blank" : undefined}
            rel={card.external ? "noreferrer" : undefined}
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#222] px-4 py-2 text-center text-sm font-bold text-[#222] transition hover:bg-[#f3f3f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
            aria-label={card.external ? `${card.actionLabel}, otevře se na externím webu` : card.actionLabel}
          >
            {card.actionLabel}
            {card.external ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : null}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function MediaCarousel({ cards, mode, loop = false, wideBreakpoint = 520 }: MediaCarouselProps) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop });
  const containerRef = useRef<HTMLElement>(null);
  const [isWide, setIsWide] = useState(false);
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(cards.length > 1);
  const visibleStart = Math.min(selected, cards.length - 1);
  const visibleEnd = Math.min(cards.length - 1, visibleStart + (isWide ? 1 : 0));
  const positionLabel = visibleStart === visibleEnd
    ? `Zobrazen krok ${visibleStart + 1} ze ${cards.length}`
    : `Zobrazeny kroky ${visibleStart + 1} až ${visibleEnd + 1} ze ${cards.length}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setIsWide(entry.contentRect.width >= wideBreakpoint));
    observer.observe(container);
    return () => observer.disconnect();
  }, [wideBreakpoint]);

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
        <div className={mode === "cards" ? "grid gap-3 @min-[520px]:grid-cols-2" : "grid gap-3"}>
          {cards.map((card, index) => <Card key={card.id} card={card} step={index + 1} />)}
        </div>
      </div>
    );
  }

  return (
    <section ref={containerRef} className="@container" aria-label="Doporučený postup">
      <div
        ref={viewportRef}
        className="overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); emblaApi?.scrollPrev(); }
          if (event.key === "ArrowRight") { event.preventDefault(); emblaApi?.scrollNext(); }
        }}
        aria-roledescription="carousel"
      >
        <div className="flex touch-pan-y gap-3">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className="min-w-0 shrink-0"
              style={{ flexBasis: isWide ? "calc(50% - 6px)" : "calc(100% - 32px)" }}
              role="group"
              aria-label={`${index + 1} z ${cards.length}`}
            >
              <Card card={card} step={index + 1} />
            </div>
          ))}
        </div>
      </div>

      {cards.length > 1 ? <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" onClick={() => emblaApi?.scrollPrev()} disabled={!canPrev} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] disabled:opacity-35" aria-label="Předchozí karty">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <span className="sr-only" aria-live="polite">{positionLabel}</span>
          <div className="flex gap-1.5" aria-hidden="true">
            {cards.map((card, index) => <span key={card.id} className={`h-1.5 rounded-full transition-all ${index >= visibleStart && index <= visibleEnd ? "w-4 bg-[#e60000]" : "w-1.5 bg-[#c8c8c8]"}`} />)}
          </div>
        </div>
        <button type="button" onClick={() => emblaApi?.scrollNext()} disabled={!canNext} className="grid h-11 w-11 place-items-center rounded-full border border-[#cccccc] text-[#222] disabled:opacity-35" aria-label="Další karty">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div> : null}
    </section>
  );
}
