import type { ReactNode } from "react";

import { isAllowedDocumentationLink } from "@/lib/tobi-docs/link-policy";

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inlineText(value: string): ReactNode[] {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="break-all rounded bg-[#f1f1f1] px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(part);
    if (link) {
      const [, label, href] = link;
      return isAllowedDocumentationLink(href)
        ? <a key={index} href={href} target={href.startsWith("https://") ? "_blank" : undefined} rel={href.startsWith("https://") ? "noreferrer" : undefined} className="font-bold text-[#a40000] underline underline-offset-2">{label}</a>
        : <span key={index}>{part}</span>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function DocMarkdown({ markdown, headingPrefix }: { markdown: string; headingPrefix: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={`code-${index}`} className="max-w-full overflow-x-auto rounded-xl bg-[#191919] p-4 text-xs leading-6 text-white"><code data-language={language}>{code.join("\n")}</code></pre>);
      continue;
    }
    if (line.startsWith("# ")) {
      const text = line.slice(2).trim();
      blocks.push(<h2 id={`${headingPrefix}-${slug(text)}`} key={`h1-${index}`} className="scroll-mt-24 text-2xl font-extrabold tracking-tight text-[#111]">{inlineText(text)}</h2>);
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      blocks.push(<h3 id={`${headingPrefix}-${slug(text)}`} key={`h2-${index}`} className="scroll-mt-24 pt-2 text-lg font-bold text-[#191919]">{inlineText(text)}</h3>);
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) items.push(lines[index++].slice(2).trim());
      blocks.push(<ul key={`list-${index}`} className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#444]">{items.map((item) => <li key={item}>{inlineText(item)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\. /.test(lines[index])) items.push(lines[index++].replace(/^\d+\. /, "").trim());
      blocks.push(<ol key={`ordered-${index}`} className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#444]">{items.map((item) => <li key={item}>{inlineText(item)}</li>)}</ol>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,2} |```|- |\d+\. )/.test(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(<p key={`p-${index}`} className="text-sm leading-7 text-[#444]">{inlineText(paragraph.join(" "))}</p>);
  }

  return <div className="min-w-0 space-y-4">{blocks}</div>;
}
