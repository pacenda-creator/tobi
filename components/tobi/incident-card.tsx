"use client";

import { ExternalLink, MapPin } from "lucide-react";
import type { Incident } from "@/lib/tobi-config";

export function IncidentCard({ incident, onOtherTopic }: { incident: Incident; onOtherTopic: () => void }) {
  const isDemo = incident.source.kind === "demo";
  return (
    <section className="rounded-[var(--tobi-radius-card)] border border-[#dedede] bg-[#fafafa] p-4" aria-labelledby={`incident-${incident.id}`}>
      {isDemo ? <p className="mb-2 text-xs font-medium text-[#777]">{incident.source.label}</p> : null}
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#e60000]" aria-hidden="true"><MapPin size={19} /></span>
        <div className="min-w-0">
          <h2 id={`incident-${incident.id}`} className="text-[15px] font-semibold leading-5 text-[#222]">{incident.title}</h2>
          <p className="mt-1 text-[15px] leading-[22px] text-[#444]">{incident.message}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={incident.detailUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#222] bg-white px-4 text-sm font-semibold text-[#222] hover:bg-[#f3f3f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]" aria-label="Ověřit svou lokalitu, otevře se na externím webu">Ověřit svou lokalitu <ExternalLink size={14} aria-hidden="true" /></a>
        <button type="button" onClick={onOtherTopic} className="min-h-11 rounded-full px-4 text-sm font-semibold text-[#444] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]">Řeším něco jiného</button>
      </div>
    </section>
  );
}
