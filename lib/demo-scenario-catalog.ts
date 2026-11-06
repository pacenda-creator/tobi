import {
  CHAT_CONTRACT_VERSION,
  chatResponseV1Schema,
  type ConversationStateV1,
  type ChatResponseV1,
  type QuickReplyV1,
  type SourceV1,
  type UiBlockV1,
} from "./contracts/chat/v1.ts";
import { vodafoneKnowledge, type KnowledgeCard } from "./vodafone-knowledge.ts";

const CHECKED_AT = "2026-10-30";
const DEMO_TOPIC_IDS = ["internet", "esim", "billing", "roaming", "pin-puk", "signal"] as const;

type DemoTopicId = typeof DEMO_TOPIC_IDS[number];

export type DemoScenarioTransition = {
  id: string;
  label: string;
  message: string;
  targetStepId: string | null;
};

export type DemoScenarioState = {
  id: string;
  triggerExamples: string[];
  allowedTransitions: DemoScenarioTransition[];
  response: ChatResponseV1;
};

export type DemoScenario = {
  demo: true;
  id: `demo-${DemoTopicId}`;
  topicId: DemoTopicId;
  label: string;
  triggerExamples: string[];
  initialState: string;
  states: Record<string, DemoScenarioState>;
};

const transitionMessages: Record<string, string> = {
  "Ano, funguje": "Internet už funguje.",
  "Už to funguje": "Internet už funguje.",
  "Výpadek není hlášený": "Nefunguje mi pevný internet a výpadek na adrese není hlášený.",
  "Nevím, jaký internet mám": "Nevím, jaký typ pevného internetu mám a potřebuji ho poznat.",
  "Stále nefunguje": "Pevný internet stále nefunguje ani po restartu modemu.",
  "Ne, stále nefunguje": "Pevný internet stále nefunguje. Potřebuji pokračovat v diagnostice.",
  "Internet nejde na žádném zařízení": "Pevný internet po restartu nefunguje na žádném zařízení.",
  "Funguje na jiném zařízení": "Pevný internet po restartu funguje na jiném zařízení, ale ne na původním.",
  "První aktivace": "Chci poprvé aktivovat eSIM.",
  "Přesun do telefonu": "Chci přesunout eSIM do nového telefonu.",
  "Aktivace selhala": "Aktivace eSIM selhala.",
  "Najít vyúčtování": "Potřebuji najít vyúčtování v Můj Vodafone.",
  "Platba se nepropsala": "Platba vyúčtování se nepropsala.",
  "Vysvětlit částku": "Potřebuji vysvětlit částku na vyúčtování.",
  "Země v EU": "Potřebuji informace o roamingu v zemi Evropské unie.",
  "Mimo EU": "Potřebuji informace o roamingu mimo Evropskou unii.",
  "Roaming nefunguje": "Roaming v zahraničí mi nefunguje.",
  "Najít PUK": "Potřebuji najít PUK.",
  "Nastavit nový PIN": "Potřebuji nastavit nový PIN po zadání PUK.",
  "Nemohu se přihlásit": "Nemohu se přihlásit do Můj Vodafone a potřebuji PUK.",
  "Ověřit pokrytí": "Potřebuji ověřit pokrytí a řeším potíže se signálem.",
  "Jen mobilní data": "Nefungují mi mobilní data, ale volání funguje.",
};

const internetTransitionsByStep: Record<string, DemoScenarioTransition[]> = {
  initial: [
    { id: "internet-resolved", label: "Ano, funguje", message: transitionMessages["Ano, funguje"], targetStepId: "resolved" },
    { id: "internet-not-resolved", label: "Ne, stále nefunguje", message: transitionMessages["Ne, stále nefunguje"], targetStepId: "after-restart" },
  ],
  "no-outage": [
    { id: "internet-resolved-after-restart", label: "Už to funguje", message: transitionMessages["Už to funguje"], targetStepId: "resolved" },
    { id: "internet-still-offline", label: "Stále nefunguje", message: transitionMessages["Stále nefunguje"], targetStepId: "after-restart" },
  ],
  "after-restart": [
    { id: "internet-all-devices-offline", label: "Internet nejde na žádném zařízení", message: transitionMessages["Internet nejde na žádném zařízení"], targetStepId: null },
    { id: "internet-other-device-works", label: "Funguje na jiném zařízení", message: transitionMessages["Funguje na jiném zařízení"], targetStepId: "resolved" },
  ],
};

function transitionsFor(topicId: DemoTopicId, stateId: string, labels: string[]): DemoScenarioTransition[] {
  if (topicId === "internet" && internetTransitionsByStep[stateId]) return internetTransitionsByStep[stateId];
  return labels.map((label, index) => ({
    id: `${topicId}-${stateId}-reply-${index + 1}`,
    label,
    message: transitionMessages[label] || label,
    targetStepId: null,
  }));
}

function sourceFor(card: KnowledgeCard): SourceV1 {
  return { id: `${card.id}-source`, title: card.sourceTitle, url: card.sourceUrl, checkedAt: CHECKED_AT };
}

function blocksFor(card: KnowledgeCard, source: SourceV1): UiBlockV1[] {
  const blocks: UiBlockV1[] = [{ type: "steps", id: "answer-steps", title: card.shortLabel, items: card.steps.map((text, index) => ({ id: `${card.id}-step-${index + 1}`, text })) }];
  if (card.warning) blocks.push({ type: "alert", id: "answer-warning", severity: "warning", text: card.warning });
  if (card.actionLabel && card.actionUrl) blocks.push({ type: "action", id: "answer-action", label: card.actionLabel, action: { kind: "openUrl", url: card.actionUrl, external: true } });
  if (card.mediaCards?.length) blocks.push({
    type: "mediaCards",
    id: "answer-media",
    cards: card.mediaCards.map((item) => ({ id: item.id, title: item.title, description: item.description, image: { src: item.image, alt: item.imageAlt }, action: item.actionLabel && item.actionUrl ? { label: item.actionLabel, action: { kind: "openUrl", url: item.actionUrl, external: item.external } } : undefined })),
  });
  blocks.push({ type: "sourceList", id: "answer-sources", sourceIds: [source.id] });
  return blocks;
}

function responseFor(topicId: DemoTopicId, stateId: string, card: KnowledgeCard, transitions: DemoScenarioTransition[]) {
  const source = sourceFor(card);
  const quickReplies: QuickReplyV1[] = transitions.map(({ id, label, message }) => ({ id, label, action: { kind: "sendMessage", message, transitionId: id } }));
  return chatResponseV1Schema.parse({
    contractVersion: CHAT_CONTRACT_VERSION,
    responseId: `demo_${topicId}_${stateId}`,
    mode: "preset",
    text: card.answer,
    quickReplyPrompt: topicId === "internet" && stateId === "initial" ? "Funguje už připojení?" : undefined,
    blocks: blocksFor(card, source),
    quickReplies,
    sources: [source],
    intent: { id: card.id, label: card.label, confidence: 0.94 },
    fallback: null,
  });
}

const coreCards = new Map(vodafoneKnowledge.filter((card) => (DEMO_TOPIC_IDS as readonly string[]).includes(card.id)).map((card) => [card.id as DemoTopicId, card]));
const internetNoOutage = vodafoneKnowledge.find((card) => card.id === "internet-no-outage")!;
const internetAfterRestart = vodafoneKnowledge.find((card) => card.id === "internet-after-restart")!;

function state(topicId: DemoTopicId, stateId: string, card: KnowledgeCard): DemoScenarioState {
  const allowedTransitions = transitionsFor(topicId, stateId, card.quickReplies);
  return { id: stateId, triggerExamples: card.triggers, allowedTransitions, response: responseFor(topicId, stateId, card, allowedTransitions) };
}

function scenario(topicId: DemoTopicId): DemoScenario {
  const card = coreCards.get(topicId)!;
  const states: Record<string, DemoScenarioState> = { initial: state(topicId, "initial", card) };
  if (topicId === "internet") {
    states["no-outage"] = state(topicId, "no-outage", internetNoOutage);
    states["after-restart"] = state(topicId, "after-restart", internetAfterRestart);
    states.resolved = {
      id: "resolved",
      triggerExamples: ["internet už funguje"],
      allowedTransitions: [],
      response: chatResponseV1Schema.parse({ contractVersion: CHAT_CONTRACT_VERSION, responseId: "demo_internet_resolved", mode: "preset", text: "Skvělé, internet už funguje. S čím dalším vám pomůžu?", blocks: [], quickReplies: [], sources: [], intent: { id: "internet", label: card.label, confidence: 0.98 }, fallback: null }),
    };
  }
  return { demo: true, id: `demo-${topicId}`, topicId, label: card.label, triggerExamples: card.triggers, initialState: "initial", states };
}

export const demoScenarioCatalog: DemoScenario[] = DEMO_TOPIC_IDS.map(scenario);

function normalizedTrigger(input: string) {
  return input.toLocaleLowerCase("cs").normalize("NFKC").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

export function findExplicitDemoScenario(input: string) {
  for (const scenarioItem of demoScenarioCatalog) {
    const initial = scenarioItem.states[scenarioItem.initialState];
    if (initial.triggerExamples.some((example) => normalizedTrigger(example) === normalizedTrigger(input))) return { scenario: scenarioItem, state: initial };
  }
  return null;
}

export type DemoScenarioMatch = { scenario: DemoScenario; state: DemoScenarioState };

function conversationState(match: DemoScenarioMatch, choices: ConversationStateV1["choices"] = []): ConversationStateV1 {
  return {
    scenarioId: match.scenario.id,
    stepId: match.state.id,
    choices,
    allowedTransitionIds: match.state.allowedTransitions.map((transition) => transition.id),
  };
}

export type DemoScenarioTransitionResult =
  | { ok: true; kind: "step"; match: DemoScenarioMatch; conversationState: ConversationStateV1 }
  | { ok: true; kind: "exit"; conversationState: null }
  | { ok: false; reason: "scenario_not_found" | "step_not_found" | "invalid_history" | "transition_not_allowed" | "target_step_not_found" };

function hasValidHistory(scenarioItem: DemoScenario, current: ConversationStateV1) {
  let expectedStepId: string | null = scenarioItem.initialState;
  for (const choice of current.choices) {
    if (!expectedStepId || choice.fromStepId !== expectedStepId) return false;
    const sourceStep: DemoScenarioState | undefined = scenarioItem.states[expectedStepId];
    const transition: DemoScenarioTransition | undefined = sourceStep?.allowedTransitions.find((candidate) => candidate.id === choice.transitionId);
    if (!transition || choice.toStepId !== transition.targetStepId) return false;
    expectedStepId = transition.targetStepId;
  }
  return expectedStepId === current.stepId;
}

export function applyDemoScenarioTransition(current: ConversationStateV1, transitionId: string): DemoScenarioTransitionResult {
  const scenarioItem = demoScenarioCatalog.find((candidate) => candidate.id === current.scenarioId);
  if (!scenarioItem) return { ok: false, reason: "scenario_not_found" };
  if (!hasValidHistory(scenarioItem, current)) return { ok: false, reason: "invalid_history" };
  const currentStep = scenarioItem.states[current.stepId];
  if (!currentStep) return { ok: false, reason: "step_not_found" };
  const transition = currentStep.allowedTransitions.find((candidate) => candidate.id === transitionId);
  if (!transition) return { ok: false, reason: "transition_not_allowed" };
  const choice = { transitionId: transition.id, fromStepId: currentStep.id, toStepId: transition.targetStepId };
  if (!transition.targetStepId) return { ok: true, kind: "exit", conversationState: null };
  const targetStep = scenarioItem.states[transition.targetStepId];
  if (!targetStep) return { ok: false, reason: "target_step_not_found" };
  const match = { scenario: scenarioItem, state: targetStep };
  return { ok: true, kind: "step", match, conversationState: conversationState(match, [...current.choices, choice]) };
}

export function instantiateDemoResponse(match: DemoScenarioMatch, state = conversationState(match)) {
  return chatResponseV1Schema.parse({ ...match.state.response, responseId: `resp_${crypto.randomUUID()}`, conversationState: state });
}
