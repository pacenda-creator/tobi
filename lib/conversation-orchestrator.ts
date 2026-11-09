import { chatResponseV1Schema, type ChatRequestV1, type ChatResponseV1 } from "./contracts/chat/v1.ts";

export type ConversationRoute = "scenario" | "rag" | "clarification";

export type ScenarioMatch<TScenario = unknown, TState = unknown> = {
  scenario: TScenario;
  state: TState;
};

type ScenarioResolver<TScenario, TState> = {
  explicit: (input: string) => ScenarioMatch<TScenario, TState> | null;
};

export type ConversationDecision<TScenario = unknown, TState = unknown> =
  | { route: "scenario"; match: ScenarioMatch<TScenario, TState>; reason: "explicit_demo" }
  | { route: "rag"; reason: "free_query" }
  | { route: "clarification"; reason: "ambiguous_query" };

const AMBIGUOUS_INPUTS = new Set([
  "pomoc",
  "pomozte mi",
  "potřebuji poradit",
  "nevím",
  "nefunguje to",
  "mám problém",
  "co mám dělat",
]);

function normalized(input: string) {
  return input.toLocaleLowerCase("cs").normalize("NFKC").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

function isAmbiguous(input: string) {
  const clean = normalized(input);
  const broadDeviceProblem = /\b(nefunguje|nejde|problem|rozbit).*(telefon|mobil|zarizeni)\b/u.test(clean)
    || /\b(telefon|mobil|zarizeni).*(nefunguje|nejde|problem|rozbit)\b/u.test(clean);
  return clean.length < 4 || AMBIGUOUS_INPUTS.has(clean) || clean.split(" ").length < 2 || broadDeviceProblem;
}

export function decideConversationRoute<TScenario, TState>(request: ChatRequestV1, resolver: ScenarioResolver<TScenario, TState>): ConversationDecision<TScenario, TState> {
  const lastMessage = request.messages.at(-1)?.content || "";
  const explicit = resolver.explicit(lastMessage);
  if (explicit) return { route: "scenario", match: explicit, reason: "explicit_demo" };
  if (isAmbiguous(lastMessage)) return { route: "clarification", reason: "ambiguous_query" };
  return { route: "rag", reason: "free_query" };
}

type OrchestratorHandlers<TScenario, TState> = {
  scenario: (match: ScenarioMatch<TScenario, TState>) => ChatResponseV1 | Promise<ChatResponseV1>;
  rag: () => ChatResponseV1 | Promise<ChatResponseV1>;
  clarification: () => ChatResponseV1 | Promise<ChatResponseV1>;
};

export async function orchestrateConversation<TScenario, TState>(request: ChatRequestV1, resolver: ScenarioResolver<TScenario, TState>, handlers: OrchestratorHandlers<TScenario, TState>): Promise<ChatResponseV1> {
  const decision = decideConversationRoute(request, resolver);
  const response = decision.route === "scenario"
    ? await handlers.scenario(decision.match)
    : decision.route === "rag"
      ? await handlers.rag()
      : await handlers.clarification();
  return chatResponseV1Schema.parse(response);
}
