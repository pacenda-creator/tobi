import { z } from "zod";

import { deterministicOperatorReply } from "@/lib/mock-operator";

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "operator"]), content: z.string().trim().min(1).max(2_000) }).strict()).min(1).max(10),
}).strict();

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (response.output_text?.trim()) return response.output_text.trim();
  return response.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text" && item.text).map((item) => item.text?.trim()).filter(Boolean).join("\n") || null;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const lastUserText = [...parsed.data.messages].reverse().find((message) => message.role === "user")?.content || "";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ text: deterministicOperatorReply(lastUserText), mode: "deterministic" });

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-astra",
        instructions: "Jsi Jana, mock operátorka zákaznické péče v UX prototypu. Mluv přátelsky, profesionálně, stručně a přirozenou češtinou. Udržuj kontext krátké konverzace a zvládni běžný small talk. Nikdy si nevymýšlej údaje o účtu, zákazníkovi ani provedených operacích. Nemáš přístup do zákaznických systémů a nesmíš předstírat skutečné backendové akce. Odpověz nejvýše třemi krátkými větami.",
        input: parsed.data.messages.map((message) => ({ role: message.role === "operator" ? "assistant" : "user", content: message.content })),
        max_output_tokens: 220,
      }),
    });
    const text = upstream.ok ? extractOutputText(await upstream.json().catch(() => null)) : null;
    return Response.json({ text: text || deterministicOperatorReply(lastUserText), mode: text ? "openai" : "deterministic" });
  } catch {
    return Response.json({ text: deterministicOperatorReply(lastUserText), mode: "deterministic" });
  }
}
