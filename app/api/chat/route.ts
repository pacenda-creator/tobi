import { handleChatV1 } from "@/lib/chat-v1-server";
import { chatResponseV1Schema } from "@/lib/contracts/chat/v1";

type LegacyMessage = { role: "assistant" | "user"; content: string };

// Compatibility adapter: legacy clients keep their request/response shape, but
// execution always goes through the same versioned config, RAG and LLM path.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | { messages?: LegacyMessage[]; tone?: "friendly" | "brief" | "formal" };
  const messages = body?.messages?.filter((message): message is LegacyMessage =>
    (message.role === "assistant" || message.role === "user") && typeof message.content === "string" && message.content.trim().length > 0,
  ).slice(-12);
  if (!messages?.length || messages.at(-1)?.role !== "user") {
    return Response.json({ error: "Chybí zpráva pro TOBiho." }, { status: 400 });
  }

  const v1Request = new Request(new URL("/api/chat/v1", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1",
      requestId: `legacy-${crypto.randomUUID()}`,
      messages,
      context: { locale: "cs-CZ", channel: "web" },
      preferences: { tone: body?.tone || "friendly" },
    }),
  });
  const v1Response = await handleChatV1(v1Request);
  const payload = await v1Response.json().catch(() => null);
  const parsed = chatResponseV1Schema.safeParse(payload);
  if (!parsed.success) return Response.json(payload || { error: "TOBi se teď nemůže spojit se službou." }, { status: v1Response.status });

  const response = parsed.data;
  const primarySource = response.sources[0];
  const steps = response.blocks.find((block) => block.type === "steps");
  const actionBlock = response.blocks.find((block) => block.type === "action");
  const action = actionBlock?.type === "action" && actionBlock.action.kind === "openUrl"
    ? actionBlock
    : undefined;
  const media = response.blocks.find((block) => block.type === "mediaCards");
  return Response.json({
    mode: response.mode === "preset" ? "mock" : response.mode,
    reply: response.text,
    configVersion: response.configVersion,
    intent: response.intent,
    quickReplies: response.quickReplies.map((reply) => reply.label),
    source: primarySource ? { title: primarySource.title, url: primarySource.url, checked: primarySource.checkedAt } : null,
    sources: response.sources.map((source) => ({ title: source.title, url: source.url, checked: source.checkedAt })),
    card: steps ? {
      title: steps.title || response.intent.label,
      steps: steps.items.map((item) => item.text),
      actionLabel: action?.label,
      actionUrl: action?.action.kind === "openUrl" ? action.action.url : undefined,
      mediaCards: media?.cards.map((card) => ({
        id: card.id, title: card.title, description: card.description, image: card.image.src, imageAlt: card.image.alt,
        actionLabel: card.action?.label,
        actionUrl: card.action?.action.kind === "openUrl" ? card.action.action.url : undefined,
        external: card.action?.action.kind === "openUrl" ? card.action.action.external : false,
      })),
    } : null,
  }, { status: v1Response.status, headers: { "Cache-Control": "no-store" } });
}
