import { findKnowledge } from "@/lib/vodafone-knowledge";
import { formatRetrievedContext, searchVodafoneKnowledge, type SearchResult } from "@/lib/vodafone-search";

type TobiEnv = Cloudflare.Env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type IncomingMessage = { role: "assistant" | "user"; content: string };

const instructionsByTone = {
  friendly: "Mluv lidsky, klidně a stručně. Emoji používej jen u neutrálních témat a maximálně jedno.",
  brief: "Odpovídej velmi stručně, maximálně ve třech větách.",
  formal: "Mluv zdvořile, profesionálně a bez emoji.",
};

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return response.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n") || null;
}

function responseMeta(lastMessage: string, retrieved: SearchResult[]) {
  const knowledge = findKnowledge(lastMessage);
  if (!knowledge) {
    if (retrieved.length) {
      const primary = retrieved[0];
      return {
        intent: { id: "retrieved", label: primary.title, confidence: Math.min(0.91, 0.64 + primary.score / 150) },
        quickReplies: ["Další podrobnosti", "Související témata", "Spojit s člověkem"],
        source: { title: primary.title, url: primary.url, checked: "30. 10. 2026" },
        sources: retrieved.slice(0, 3).map((result) => ({
          title: result.title,
          url: result.url,
          checked: result.updated || "30. 10. 2026",
        })),
        card: null,
      };
    }
    return {
      intent: { id: "unknown", label: "Potřebuji upřesnit", confidence: 0.42 },
      quickReplies: ["Internet a Wi‑Fi", "eSIM a SIM", "Vyúčtování", "Roaming"],
      source: null,
      sources: [],
      card: null,
    };
  }
  return {
    intent: { id: knowledge.id, label: knowledge.label, confidence: 0.94 },
    quickReplies: knowledge.quickReplies,
    source: { title: knowledge.sourceTitle, url: knowledge.sourceUrl, checked: "30. 10. 2026" },
    sources: [{ title: knowledge.sourceTitle, url: knowledge.sourceUrl, checked: "30. 10. 2026" }],
    card: {
      title: knowledge.shortLabel,
      steps: knowledge.steps,
      warning: knowledge.warning,
      actionLabel: knowledge.actionLabel,
      actionUrl: knowledge.actionUrl,
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | {
    messages?: IncomingMessage[];
    tone?: keyof typeof instructionsByTone;
  };

  const messages = body?.messages
    ?.filter(
      (message): message is IncomingMessage =>
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-12);

  if (!messages?.length) {
    return Response.json({ error: "Chybí zpráva pro TOBiho." }, { status: 400 });
  }

  const lastMessage = messages.at(-1)?.content || "";
  const retrieved = searchVodafoneKnowledge(lastMessage, 4);
  const meta = responseMeta(lastMessage, retrieved);
  const knowledge = findKnowledge(lastMessage);
  const runtime = process.env as TobiEnv;

  if (!runtime.OPENAI_API_KEY) {
    await new Promise((resolve) => setTimeout(resolve, 520));
    return Response.json({
      mode: "mock",
      reply: knowledge?.answer
        || (retrieved.length
          ? `Na Vodafone.cz jsem našel odpovídající téma „${retrieved[0].title}“. ${retrieved[0].snippet}`
          : "Chci si být jistý, že vám poradím správně. Zkuste prosím doplnit službu nebo zařízení, kterého se dotaz týká."),
      ...meta,
    });
  }

  const tone = body?.tone && instructionsByTone[body.tone] ? body.tone : "friendly";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.OPENAI_MODEL || "gpt-6-astra",
      instructions: `Jsi TOBi, AI asistent Vodafonu v českém prototypu. Vždy se označuj jako AI. Nejprve jednou větou potvrď záměr zákazníka. Odpovídej pouze z dohledaných zdrojů níže; pokud podklad nestačí, přiznej nejistotu a nabídni odkaz na Centrum péče nebo předání člověku. Nikdy nevymýšlej stav účtu, služby, cenu ani výpadek. Nikdy nežádej PIN, PUK, heslo, celé číslo karty ani QR kód eSIM. Jedna odpověď má řešit jeden krok. ${instructionsByTone[tone]}\n\nDOHLEDANÉ ZDROJE Z VODAFONE.CZ:\n${formatRetrievedContext(retrieved) || "Pro tento dotaz nebyl nalezen dostatečně relevantní veřejný zdroj."}`,
      input: messages.map((message) => ({ role: message.role, content: message.content })),
      max_output_tokens: 350,
    }),
  });

  const payload = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : null;
    console.error("OpenAI Responses API error", apiResponse.status, detail);
    return Response.json({ error: "TOBi se teď nemůže spojit s AI. Zkuste to prosím za chvíli." }, { status: 502 });
  }

  const reply = extractOutputText(payload);
  if (!reply) return Response.json({ error: "AI vrátila prázdnou odpověď." }, { status: 502 });
  return Response.json({ mode: "openai", reply, ...meta });
}
