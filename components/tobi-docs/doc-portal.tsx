"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { DocDiagram } from "@/components/tobi-docs/doc-diagram";
import { DocMarkdown } from "@/components/tobi-docs/doc-markdown";
import type { DocManifest, DocumentationStatus, TestMode, TestResult, TobiDocContent } from "@/lib/tobi-docs/schema";

const sections = [
  ["overview", "Přehled"],
  ["features", "Funkcionality"],
  ["architecture", "Architektura"],
  ["regression", "Regresní testy"],
  ["coverage", "Pokrytí a výsledky"],
  ["operations", "Provoz a údržba"],
] as const;

const statusLabels: Record<DocumentationStatus, string> = {
  IMPLEMENTED: "Implementováno",
  DEMO: "Demo",
  PARTIAL: "Částečně implementováno",
  PLANNED: "Plánováno",
  UNVERIFIED: "Neověřeno",
};

const modeLabels: Record<TestMode, string> = {
  AUTOMATED: "Automatický",
  MANUAL: "Manuální",
  NOT_AUTOMATED: "Není automatizováno",
};

const resultLabels: Record<TestResult, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_RUN: "NOT RUN",
  MANUAL: "MANUAL",
  NOT_AUTOMATED: "NOT AUTOMATED",
};

type SearchMatch = {
  id: string;
  label: string;
  section: string;
  kind: "feature" | "test" | "section";
};

const SourceReferenceContext = createContext<Pick<DocManifest, "sourceBaseUrl" | "changedSources"> | null>(null);

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");
}

function StatusBadge({ value }: { value: DocumentationStatus }) {
  return <span className="inline-flex rounded-full border border-[#d4d4d4] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#444]">{statusLabels[value]}</span>;
}

function ResultBadge({ value }: { value: TestResult }) {
  const tone = value === "PASS" ? "border-[#86bf7d] bg-[#edf8eb] text-[#205c18]" : value === "FAIL" ? "border-[#e60000] bg-[#fff0f0] text-[#a40000]" : "border-[#d4d4d4] bg-[#f4f4f4] text-[#555]";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${tone}`}>{resultLabels[value]}</span>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-6"><h2 id={`${id}-title`} className="text-xl font-extrabold text-[#111]">{title}</h2><div className="mt-5">{children}</div></section>;
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return <nav aria-label="Obsah dokumentace"><ul className="space-y-1">{sections.map(([id, label]) => <li key={id}><a onClick={onNavigate} href={`#${id}`} className="block min-h-11 rounded-lg px-3 py-2.5 text-sm font-bold text-[#333] hover:bg-[#f0f0f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]">{label}</a></li>)}</ul></nav>;
}

function sourceHref(baseUrl: string, reference: string) {
  const match = /^(.*?)(?::(\d+))?$/u.exec(reference);
  const path = (match?.[1] ?? reference).split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/u, "")}/${path}${match?.[2] ? `#L${match[2]}` : ""}`;
}

function SourceReference({ reference }: { baseUrl: string; reference: string }) {
  const sourceContext = useContext(SourceReferenceContext);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const sourcePath = reference.replace(/:\d+$/u, "");
  const changedFromBase = sourceContext ? Object.hasOwn(sourceContext.changedSources, sourcePath) : true;
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  if (!changedFromBase && sourceContext) {
    return <a href={sourceHref(sourceContext.sourceBaseUrl, reference)} target="_blank" rel="noreferrer" className="mr-2 inline-block break-all rounded bg-[#f0f0f0] px-1 font-mono text-xs font-bold text-[#8a0000] underline underline-offset-2">{reference}<span className="sr-only"> (otevřít zdroj v doložené revizi)</span></a>;
  }
  return (
    <span className="mr-2 inline-flex max-w-full flex-wrap items-center gap-1">
      <button type="button" onClick={copyReference} className="break-all rounded bg-[#f0f0f0] px-1 font-mono text-xs font-bold text-[#8a0000] underline underline-offset-2" title="Kopírovat cestu ke zdroji">{reference}</button>
      <span className="rounded bg-[#fff1cc] px-1.5 py-0.5 text-[10px] font-bold text-[#684b00]">Změněno proti base</span>
      <span aria-live="polite" className="sr-only">{copyStatus === "copied" ? "Cesta zkopírována." : copyStatus === "failed" ? "Cestu se nepodařilo zkopírovat." : ""}</span>
    </span>
  );
}

export default function DocPortal({ content }: { content: TobiDocContent }) {
  const [query, setQuery] = useState("");
  const [featureStatus, setFeatureStatus] = useState<DocumentationStatus | "ALL">("ALL");
  const [testCategory, setTestCategory] = useState("ALL");
  const [testMode, setTestMode] = useState<TestMode | "ALL">("ALL");
  const [testResult, setTestResult] = useState<TestResult | "ALL">("ALL");

  const categories = useMemo(() => [...new Set(content.regressionCases.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "cs")), [content.regressionCases]);
  const normalizedQuery = normalize(query.trim());
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    const featureMatches: SearchMatch[] = content.features
      .filter((item) => normalize([item.id, item.name, item.scenario, item.behavior, ...item.sourceRefs].join(" ")).includes(normalizedQuery))
      .map((item) => ({ id: item.id.toLocaleLowerCase(), label: `${item.id} · ${item.name}`, section: "Funkcionality", kind: "feature" }));
    const testMatches: SearchMatch[] = content.regressionCases
      .filter((item) => normalize([item.id, item.title, item.category, ...item.steps, ...item.expected].join(" ")).includes(normalizedQuery))
      .map((item) => ({ id: item.id.toLocaleLowerCase(), label: `${item.id} · ${item.title}`, section: "Regresní testy", kind: "test" }));
    const sectionCandidates: Array<SearchMatch & { searchable: string }> = [
      { id: "overview", label: "Přehled", section: "Přehled", kind: "section", searchable: `${content.overview} ${content.manifest.scopeNote} ${content.manifest.reviewedSourceRevision}` },
      { id: "architecture", label: "Architektura", section: "Architektura", kind: "section", searchable: content.architecture },
      { id: "operations", label: "Provoz a údržba", section: "Provoz a údržba", kind: "section", searchable: content.operations },
      ...content.diagrams.map((item) => ({ id: `diagram-${item.id}`, label: item.title, section: "Architektura", kind: "section" as const, searchable: `${item.id} ${item.title} ${item.nodes.join(" ")} ${item.connections.flatMap((connection) => [connection.from, connection.to, connection.label ?? ""]).join(" ")} ${item.textAlternative}` })),
      ...content.testRuns.map((item) => ({ id: item.id.toLocaleLowerCase(), label: item.id, section: "Pokrytí a výsledky", kind: "section" as const, searchable: `${item.id} ${item.summary} ${item.command} ${item.environment} ${item.evidence}` })),
    ];
    const sectionMatches = sectionCandidates
      .filter((item) => normalize(`${item.label} ${item.searchable}`).includes(normalizedQuery))
      .map(({ id, label, section, kind }) => ({ id, label, section, kind }));
    return [...featureMatches, ...testMatches, ...sectionMatches];
  }, [content, normalizedQuery]);

  const visibleFeatures = content.features.filter((item) => featureStatus === "ALL" || item.status === featureStatus);
  const visibleTests = content.regressionCases.filter((item) =>
    (testCategory === "ALL" || item.category === testCategory)
    && (testMode === "ALL" || item.mode === testMode)
    && (testResult === "ALL" || item.lastResult === testResult));

  useEffect(() => {
    const openHashTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const details = target?.closest("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
    };
    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, []);

  const resetTestFilters = () => { setTestCategory("ALL"); setTestMode("ALL"); setTestResult("ALL"); };
  const revealTarget = (match: Pick<SearchMatch, "id" | "kind">) => {
    if (match.kind === "feature") setFeatureStatus("ALL");
    if (match.kind === "test") resetTestFilters();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = document.getElementById(match.id);
      if (!target) return;
      const details = target.closest("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      window.history.pushState(null, "", `#${match.id}`);
      target.scrollIntoView({ block: "start" });
      const focusTarget = details?.querySelector("summary") ?? target;
      if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
    }));
  };

  return (
    <SourceReferenceContext.Provider value={content.manifest}>
    <main className="min-h-dvh bg-[#f5f5f5] text-[#191919]">
      <a href="#doc-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:outline focus:outline-2 focus:outline-[#e60000]">Přeskočit na obsah</a>
      <header className="border-b border-[#d8d8d8] bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#e60000]">Interní portál</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Dokumentace TOBi</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#555]">Jediný orientační bod pro skutečně ověřený stav prototypu, jeho architekturu a regresní pokrytí.</p></div><a href="/admin" className="inline-flex min-h-11 items-center rounded-xl border border-[#d4d4d4] px-4 py-2 text-sm font-bold hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]">Administrace</a></div>
          <label htmlFor="doc-search" className="mt-5 block max-w-2xl text-sm font-bold">Hledat v dokumentaci</label>
          <div className="mt-2 flex max-w-2xl gap-2"><input id="doc-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Např. PUK, operátor nebo REG-001" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#bdbdbd] bg-white px-3 text-sm outline-none focus:border-[#e60000] focus:ring-2 focus:ring-[#e60000]/20" />{query ? <button type="button" onClick={() => setQuery("")} className="min-h-11 rounded-xl border border-[#d4d4d4] px-3 text-sm font-bold hover:bg-[#f5f5f5]">Vymazat</button> : null}</div>
          {query ? <div className="mt-3 max-w-2xl rounded-xl border border-[#dedede] bg-[#fafafa] p-3"><p aria-live="polite" className="text-xs font-bold text-[#555]">Nalezeno: {searchMatches.length}</p>{searchMatches.length ? <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">{searchMatches.map((match) => <li key={`${match.section}-${match.id}`}><a href={`#${match.id}`} onClick={(event) => { event.preventDefault(); revealTarget(match); }} className="block rounded-lg px-2 py-2 text-sm hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e60000]"><span className="font-bold">{match.label}</span><span className="ml-2 text-xs text-[#777]">{match.section}</span></a></li>)}</ul> : <div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-sm text-[#555]">Žádná položka neodpovídá hledání.</p><button type="button" className="text-sm font-bold text-[#b00000] underline" onClick={() => setQuery("")}>Vymazat hledání</button></div>}</div> : null}
        </div>
      </header>

      <details className="border-b border-[#d8d8d8] bg-white px-4 py-2 lg:hidden"><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">Obsah dokumentace</summary><Navigation /></details>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden self-start rounded-2xl border border-[#dedede] bg-white p-3 lg:sticky lg:top-6 lg:block"><Navigation /></aside>
        <div id="doc-content" className="min-w-0 space-y-6">
          <Section id="overview" title="Přehled"><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><DocMarkdown markdown={content.overview} headingPrefix="overview" /><dl className="h-fit min-w-0 rounded-xl border border-[#dedede] bg-[#fafafa] p-4 text-sm"><dt className="font-bold">Revize dokumentace</dt><dd className="mt-1 text-[#555]">{content.manifest.documentationReviewedAt}</dd><dt className="mt-4 font-bold">Poslední doložený běh</dt><dd className="mt-1 text-[#555]">{content.manifest.lastVerifiedTestRunAt}</dd><dt className="mt-4 font-bold">Revidovaný stav</dt><dd className="mt-1 break-words text-[#555]">{content.manifest.reviewedSourceRevision}</dd></dl></div><p className="mt-4 rounded-xl border-l-4 border-[#e60000] bg-[#fff7f7] p-3 text-sm leading-6 text-[#555]">{content.manifest.scopeNote}</p></Section>

          <Section id="features" title="Funkcionality"><div className="mb-4 flex flex-wrap items-end gap-3"><label className="text-sm font-bold">Stav implementace<select value={featureStatus} onChange={(event) => setFeatureStatus(event.target.value as DocumentationStatus | "ALL")} className="mt-1 block min-h-11 rounded-xl border border-[#bdbdbd] bg-white px-3 font-normal"><option value="ALL">Všechny stavy</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p aria-live="polite" className="pb-3 text-xs font-bold text-[#666]">Zobrazeno {visibleFeatures.length} z {content.features.length}</p></div>{visibleFeatures.length ? <div className="space-y-3">{visibleFeatures.map((feature) => <details id={feature.id.toLocaleLowerCase()} key={feature.id} className="scroll-mt-6 rounded-xl border border-[#dedede] bg-[#fafafa] open:bg-white"><summary className="min-h-11 cursor-pointer list-none p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold"><span className="mr-2 text-xs text-[#777]">{feature.id}</span>{feature.name}</span><StatusBadge value={feature.status} /></div><p className="mt-2 text-sm leading-6 text-[#555]">{feature.behavior}</p></summary><div className="border-t border-[#e2e2e2] p-4 text-sm leading-6"><p><strong>Zákaznický scénář:</strong> {feature.scenario}</p><p className="mt-2"><strong>Vstupní body:</strong> {feature.entryPoints.join(", ")}</p><p className="mt-2"><strong>Závislosti:</strong> {feature.dependencies.length ? feature.dependencies.join(", ") : "Žádné evidované"}</p><p className="mt-2"><strong>Konfigurace:</strong> {feature.configRefs.length ? feature.configRefs.join(", ") : "Bez samostatné konfigurace"}</p><p className="mt-2"><strong>Zdroj:</strong> {feature.sourceRefs.map((ref) => <SourceReference key={ref} baseUrl={content.manifest.sourceBaseUrl} reference={ref} />)}</p><p className="mt-2"><strong>Regrese:</strong> {feature.testCaseIds.map((id) => <a key={id} href={`#${id.toLocaleLowerCase()}`} onClick={(event) => { event.preventDefault(); revealTarget({ id: id.toLocaleLowerCase(), kind: "test" }); }} className="mr-2 font-bold text-[#a40000] underline">{id}</a>)}</p></div></details>)}</div> : <div className="rounded-xl border border-dashed border-[#bbb] p-5 text-sm"><p>Žádná položka neodpovídá výběru.</p><button onClick={() => setFeatureStatus("ALL")} className="mt-2 font-bold text-[#a40000] underline">Zrušit filtry</button></div>}</Section>

          <Section id="architecture" title="Architektura"><DocMarkdown markdown={content.architecture} headingPrefix="architecture" /><div className="mt-6 space-y-4">{content.diagrams.map((diagram) => <DocDiagram key={diagram.id} diagram={diagram} />)}</div></Section>

          <Section id="regression" title="Regresní testy"><div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-bold">Kategorie<select value={testCategory} onChange={(event) => setTestCategory(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#bdbdbd] bg-white px-3 font-normal"><option value="ALL">Všechny</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-bold">Způsob ověření<select value={testMode} onChange={(event) => setTestMode(event.target.value as TestMode | "ALL")} className="mt-1 block min-h-11 w-full rounded-xl border border-[#bdbdbd] bg-white px-3 font-normal"><option value="ALL">Všechny</option>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-bold">Výsledek běhu<select value={testResult} onChange={(event) => setTestResult(event.target.value as TestResult | "ALL")} className="mt-1 block min-h-11 w-full rounded-xl border border-[#bdbdbd] bg-white px-3 font-normal"><option value="ALL">Všechny</option>{Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex items-end"><button type="button" onClick={resetTestFilters} className="min-h-11 rounded-xl border border-[#d4d4d4] px-3 text-sm font-bold hover:bg-[#f5f5f5]">Zrušit filtry</button></div></div><p aria-live="polite" className="mb-3 text-xs font-bold text-[#666]">Zobrazeno {visibleTests.length} ze {content.regressionCases.length} případů</p>{visibleTests.length ? <div className="space-y-3">{visibleTests.map((test) => <details id={test.id.toLocaleLowerCase()} key={test.id} className="scroll-mt-6 rounded-xl border border-[#dedede] bg-[#fafafa] open:bg-white"><summary className="min-h-11 cursor-pointer list-none p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold"><span className="mr-2 text-xs text-[#777]">{test.id} · {test.priority}</span>{test.title}</span><ResultBadge value={test.lastResult} /></div><p className="mt-2 text-xs font-bold text-[#666]">{test.category} · {modeLabels[test.mode]}</p></summary><div className="grid gap-4 border-t border-[#e2e2e2] p-4 text-sm leading-6 lg:grid-cols-2"><div><h3 className="font-bold">Předpoklady</h3><ul className="list-disc pl-5">{test.preconditions.length ? test.preconditions.map((item) => <li key={item}>{item}</li>) : <li>Žádné zvláštní předpoklady</li>}</ul><h3 className="mt-3 font-bold">Postup / vstup</h3><ol className="list-decimal pl-5">{test.steps.map((item) => <li key={item}>{item}</li>)}</ol></div><div><h3 className="font-bold">Očekávaný výsledek</h3><ul className="list-disc pl-5">{test.expected.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3"><strong>Implementace:</strong> {test.implementationRefs.map((ref) => <SourceReference key={ref} baseUrl={content.manifest.sourceBaseUrl} reference={ref} />)}</p>{test.automation ? <div className="mt-3 rounded-lg bg-[#f5f5f5] p-3"><p><strong>Test:</strong> <SourceReference baseUrl={content.manifest.sourceBaseUrl} reference={test.automation.file} /></p><p><strong>Název:</strong> {test.automation.testName}</p><p><strong>Příkaz:</strong> <code>{test.automation.command}</code></p></div> : null}{test.run ? <p className="mt-3 text-xs text-[#666]">Důkaz: {test.run.id}, {test.run.executedAt}, {test.run.summary}</p> : <p className="mt-3 text-xs font-bold text-[#666]">Bez doloženého automatického běhu.</p>}</div></div></details>)}</div> : <div className="rounded-xl border border-dashed border-[#bbb] p-5 text-sm"><p>Žádná položka neodpovídá výběru.</p><button onClick={resetTestFilters} className="mt-2 font-bold text-[#a40000] underline">Zrušit filtry</button></div>}</Section>

          <Section id="coverage" title="Pokrytí a výsledky"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(["PASS","FAIL","MANUAL","NOT_AUTOMATED","NOT_RUN"] as TestResult[]).map((result) => { const count = content.regressionCases.filter((test) => test.lastResult === result).length; return <div key={result} className="rounded-xl border border-[#dedede] bg-[#fafafa] p-4"><ResultBadge value={result} /><p className="mt-2 text-2xl font-extrabold">{count}</p><p className="text-xs text-[#666]">regresních případů</p></div>; })}</div><div className="mt-5 space-y-3">{content.testRuns.map((run) => <article id={run.id.toLocaleLowerCase()} key={run.id} className="scroll-mt-6 rounded-xl border border-[#dedede] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{run.id}</h3><ResultBadge value={run.result} /></div><p className="mt-2 text-sm">{run.summary}</p>{!run.releaseEvidence ? <p className="mt-2 rounded-lg bg-[#fff7df] px-3 py-2 text-xs font-bold text-[#684b00]">Lokální informační běh; nejde o commit-bound release evidenci.</p> : null}<dl className="mt-3 grid gap-2 text-xs text-[#666] sm:grid-cols-2"><div><dt className="font-bold">Datum</dt><dd>{run.executedAt}</dd></div><div><dt className="font-bold">Příkaz</dt><dd><code className="break-all">{run.command}</code></dd></div><div><dt className="font-bold">Revize</dt><dd className="break-words">{run.testedRevision}</dd></div><div><dt className="font-bold">Evidence</dt><dd><SourceReference baseUrl={content.manifest.sourceBaseUrl} reference={run.evidence} /></dd></div></dl></article>)}</div><p className="mt-4 text-sm leading-6 text-[#555]">Automatizace a výsledek jsou oddělené údaje. Případ bez doloženého běhu se nikdy automaticky neoznačí jako PASS.</p></Section>

          <Section id="operations" title="Provoz a údržba"><DocMarkdown markdown={content.operations} headingPrefix="operations" /></Section>
        </div>
      </div>
    </main>
    </SourceReferenceContext.Provider>
  );
}
