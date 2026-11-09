"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

import type { TariffComparisonBlockV1 } from "@/lib/contracts/chat/v1";

type Tariff = TariffComparisonBlockV1["tariffs"][number];

function formatPrice(value: number) {
  return `${new Intl.NumberFormat("cs-CZ").format(value)} Kč`;
}

function checkedAtLabel(checkedAt: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${checkedAt}T12:00:00Z`));
}

function priceValue(tariff: Tariff) {
  return <span>
    <span className="block font-extrabold text-[#222]">{formatPrice(tariff.monthlyPriceCzk)} / měsíc</span>
    {tariff.listPriceCzk ? <span className="block text-[10px] text-[#777] line-through">Běžně {formatPrice(tariff.listPriceCzk)}</span> : null}
  </span>;
}

function dataValue(tariff: Tariff) {
  if (tariff.data.kind === "limited") return `${tariff.data.gb} GB`;
  return tariff.data.speedMbps ? `Neomezeně · ${tariff.data.speedMbps} Mb/s` : "Neomezeně";
}

const rows = [
  { id: "price", label: "Cena za měsíc", render: priceValue },
  { id: "data", label: "Data", render: dataValue },
  { id: "calls", label: "Volání", render: () => "Neomezené" },
  { id: "sms", label: "SMS", render: () => "Neomezené" },
  { id: "commitment", label: "Závazek", render: () => "Bez závazku u samostatného tarifu" },
  { id: "condition", label: "Podmínky ceny", render: (tariff: Tariff) => tariff.priceCondition },
] as const;

function TariffCard({ tariff }: { tariff: Tariff }) {
  return <article className="flex min-h-[232px] flex-col rounded-2xl border border-[#d8d8d8] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
    <h3 className="text-base font-extrabold leading-5 text-[#222]">{tariff.name}</h3>
    <dl className="mt-3 grid gap-2.5 text-xs leading-4">
      <div className="grid grid-cols-[minmax(72px,.72fr)_minmax(0,1.28fr)] gap-3">
        <dt className="font-bold text-[#555]">Cena</dt>
        <dd>{priceValue(tariff)}</dd>
      </div>
      <div className="grid grid-cols-[minmax(72px,.72fr)_minmax(0,1.28fr)] gap-3">
        <dt className="font-bold text-[#555]">Data</dt>
        <dd className="font-semibold text-[#333]">{dataValue(tariff)}</dd>
      </div>
      <div className="grid grid-cols-[minmax(72px,.72fr)_minmax(0,1.28fr)] gap-3">
        <dt className="font-bold text-[#555]">Volání a SMS</dt>
        <dd className="font-semibold text-[#333]">Neomezeně</dd>
      </div>
      <div className="grid grid-cols-[minmax(72px,.72fr)_minmax(0,1.28fr)] gap-3">
        <dt className="font-bold text-[#555]">Závazek</dt>
        <dd className="text-[#444]">Bez závazku</dd>
      </div>
      {tariff.priceCondition ? <div className="grid grid-cols-[minmax(72px,.72fr)_minmax(0,1.28fr)] gap-3">
        <dt className="font-bold text-[#555]">Podmínka ceny</dt>
        <dd className="text-[#444]">{tariff.priceCondition}</dd>
      </div> : null}
    </dl>
    {tariff.mismatch ? <p className="mt-3 rounded-xl bg-[#fff6df] px-3 py-2 text-[11px] font-semibold leading-4 text-[#695015]">{tariff.mismatch}</p> : null}
    <a
      href={tariff.detailUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Detail tarifu ${tariff.name}, otevře se na externím webu`}
      className="mt-auto inline-flex min-h-9 items-center gap-1.5 self-start pt-3 text-xs font-bold text-[#a00000] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc]"
    >
      Detail tarifu <ExternalLink size={12} aria-hidden="true" />
    </a>
  </article>;
}

function TariffCarousel({ block }: { block: TariffComparisonBlockV1 }) {
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", loop: false });
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(block.tariffs.length > 1);

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

  useEffect(() => { emblaApi?.reInit(); }, [block.tariffs, emblaApi]);

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasNavigation = block.tariffs.length > 1;

  return <section className="mt-3 min-w-0" aria-labelledby={`${block.id}-title`}>
    <h3 id={`${block.id}-title`} className="sr-only">{block.title}</h3>
    {hasNavigation ? <div className="sticky top-0 z-10 mb-2 flex min-h-11 items-center justify-between gap-3 bg-white" aria-label="Navigace doporučených tarifů">
      <button
        type="button"
        onClick={() => emblaApi?.scrollPrev(reduceMotion())}
        disabled={!canPrev}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#ccc] bg-white text-[#222] hover:border-[#999] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc] disabled:opacity-35"
        aria-label="Předchozí tarif"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <span className="text-xs font-bold text-[#555]" aria-live="polite" aria-atomic="true">Tarif {selected + 1} ze {block.tariffs.length}</span>
      <button
        type="button"
        onClick={() => emblaApi?.scrollNext(reduceMotion())}
        disabled={!canNext}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#ccc] bg-white text-[#222] hover:border-[#999] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc] disabled:opacity-35"
        aria-label="Další tarif"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div> : null}
    <div
      ref={viewportRef}
      className="overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc]"
      tabIndex={hasNavigation ? 0 : undefined}
      aria-label={hasNavigation ? "Doporučené tarify" : undefined}
      aria-roledescription={hasNavigation ? "carousel" : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); emblaApi?.scrollPrev(reduceMotion()); }
        if (event.key === "ArrowRight") { event.preventDefault(); emblaApi?.scrollNext(reduceMotion()); }
      }}
    >
      <div className="flex touch-pan-y">
        {block.tariffs.map((tariff, index) => <div
          key={tariff.tariffId}
          className="min-w-0 shrink-0 basis-full"
          role={hasNavigation ? "group" : undefined}
          aria-label={hasNavigation ? `Tarif ${index + 1} ze ${block.tariffs.length}` : undefined}
          aria-hidden={hasNavigation && index !== selected}
          inert={hasNavigation && index !== selected}
        >
          <TariffCard tariff={tariff} />
        </div>)}
      </div>
    </div>
    <p className="mt-2 text-[10px] leading-4 text-[#777]">Ceny zkontrolovány {checkedAtLabel(block.checkedAt)}.</p>
  </section>;
}

function TariffTable({ block }: { block: TariffComparisonBlockV1 }) {
  const checkedAt = checkedAtLabel(block.checkedAt);

  return <section className="@container/tariff mt-3 overflow-hidden rounded-2xl border border-[#d8d8d8] bg-white" aria-labelledby={`${block.id}-title`}>
    <div className="border-b border-[#e3e3e3] bg-[#fafafa] px-4 py-3">
      <h3 id={`${block.id}-title`} className="text-sm font-extrabold text-[#222]">{block.title}</h3>
      <p className="mt-1 text-[10px] leading-4 text-[#666]">Orientační srovnání samostatných tarifů podle katalogu z {checkedAt}.</p>
      {block.warning ? <p role="status" className="mt-2 rounded-lg bg-[#fff2cf] px-2.5 py-2 text-[11px] font-bold leading-4 text-[#695015]">{block.warning}</p> : null}
    </div>

    <div className="@min-[480px]/tariff:hidden">
      {rows.map((row) => <section key={row.id} className="border-b border-[#ededed] px-4 py-3 last:border-b-0" aria-labelledby={`${block.id}-${row.id}`}>
        <h4 id={`${block.id}-${row.id}`} className="text-[11px] font-extrabold uppercase tracking-wide text-[#666]">{row.label}</h4>
        <dl className="mt-2 grid gap-2">
          {block.tariffs.map((tariff) => <div key={tariff.tariffId} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 rounded-xl p-2.5 ${tariff.tariffId === block.highlightedTariffId ? "bg-[#fff3f3]" : "bg-[#fafafa]"}`}>
            <dt className="text-[11px] font-bold leading-4 text-[#333]">
              <span className="block">{tariff.name}</span>
              {row.id === "price" ? <a href={tariff.detailUrl} target="_blank" rel="noreferrer" aria-label={`Detail ${tariff.name}`} className="mt-1 inline-flex min-h-6 items-center gap-1 text-[10px] font-semibold text-[#a00000] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc]">Detail <ExternalLink size={10} aria-hidden="true" /></a> : null}
            </dt>
            <dd className="text-[11px] leading-4 text-[#444]">{row.render(tariff)}</dd>
          </div>)}
        </dl>
      </section>)}
    </div>

    <div className="hidden @min-[480px]/tariff:block">
      <table className="w-full table-fixed border-collapse text-left text-[11px] leading-4">
        <caption className="sr-only">Srovnání ceny, dat, volání, SMS a podmínek vybraných tarifů</caption>
        <thead>
          <tr className="border-b border-[#dedede]">
            <th scope="col" className="w-[25%] px-3 py-3 font-bold text-[#555]">Parametr</th>
            {block.tariffs.map((tariff) => <th key={tariff.tariffId} scope="col" className={`break-words px-2 py-3 text-xs font-extrabold text-[#222] ${tariff.tariffId === block.highlightedTariffId ? "bg-[#fff3f3]" : ""}`}>
              <span className="block">{tariff.name}</span>
              <a href={tariff.detailUrl} target="_blank" rel="noreferrer" aria-label={`Detail ${tariff.name}`} className="mt-1 inline-flex min-h-6 items-center gap-1 text-[10px] font-semibold text-[#a00000] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005fcc]">Detail <ExternalLink size={10} aria-hidden="true" /></a>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.id} className="border-b border-[#ededed] last:border-b-0">
            <th scope="row" className="px-3 py-3 align-top font-bold text-[#555]">{row.label}</th>
            {block.tariffs.map((tariff) => <td key={tariff.tariffId} className={`break-words px-2 py-3 align-top text-[#444] ${tariff.tariffId === block.highlightedTariffId ? "bg-[#fffafa]" : ""}`}>{row.render(tariff)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

export function TariffComparison({ block }: { block: TariffComparisonBlockV1 }) {
  return block.presentation === "carousel" ? <TariffCarousel block={block} /> : <TariffTable block={block} />;
}
