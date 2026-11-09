import type { DocDiagram as DocDiagramData } from "@/lib/tobi-docs/schema";

export function DocDiagram({ diagram }: { diagram: DocDiagramData }) {
  return (
    <figure id={`diagram-${diagram.id}`} className="rounded-2xl border border-[#dedede] bg-[#fafafa] p-4">
      <figcaption className="font-bold text-[#191919]">{diagram.title}</figcaption>
      <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label={`${diagram.title}: prvky`}>
        {diagram.nodes.map((node, index) => (
          <li key={node} className="flex min-h-16 items-center rounded-xl border border-[#d6d6d6] bg-white p-3 text-sm font-semibold text-[#333]">
            <span className="mr-2 inline-grid size-6 shrink-0 place-items-center rounded-full bg-[#e60000] text-xs font-extrabold text-white">{index + 1}</span>
            <span className="break-words">{node}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border border-[#dedede] bg-white p-3">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#666]">Skutečné vazby</p>
        <ul className="mt-2 space-y-2 text-sm" aria-label={`${diagram.title}: vazby`}>
          {diagram.connections.map((connection) => (
            <li key={`${connection.from}-${connection.to}-${connection.label ?? ""}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <span className="rounded-lg bg-[#f5f5f5] px-2 py-1 font-semibold">{connection.from}</span>
              <span className="text-center text-[#a40000]" aria-label={connection.label ? `vede na: ${connection.label}` : "vede na"}>→{connection.label ? <span className="block max-w-28 text-[10px] font-bold leading-3 text-[#666]">{connection.label}</span> : null}</span>
              <span className="rounded-lg bg-[#f5f5f5] px-2 py-1 font-semibold">{connection.to}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#666]"><span className="font-bold">Textová alternativa:</span> {diagram.textAlternative}</p>
    </figure>
  );
}
