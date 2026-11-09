import type { TobiRuntimeState } from "@/lib/tobi-config";

export type OperatorSessionState = TobiRuntimeState["handoverState"];
export type OperatorSessionEvent =
  | "request_handover"
  | "queue_started"
  | "agent_connected"
  | "agent_message"
  | "cancel_waiting"
  | "agent_disconnected"
  | "new_chat";

const transitions: Record<OperatorSessionState, Partial<Record<OperatorSessionEvent, OperatorSessionState>>> = {
  bot_active: { request_handover: "handover_requested", new_chat: "bot_active" },
  handover_requested: { queue_started: "waiting_for_agent" },
  waiting_for_agent: { agent_connected: "agent_connected", cancel_waiting: "bot_active" },
  agent_connected: { agent_message: "agent_connected", agent_disconnected: "conversation_ended" },
  conversation_ended: { new_chat: "bot_active" },
};

export function nextOperatorSessionState(state: OperatorSessionState, event: OperatorSessionEvent) {
  return transitions[state][event] ?? null;
}

export function applyOperatorSessionEvent(runtime: TobiRuntimeState, event: OperatorSessionEvent): TobiRuntimeState {
  const nextState = nextOperatorSessionState(runtime.handoverState, event);
  if (!nextState) return runtime;
  return {
    ...runtime,
    handoverState: nextState,
    conversationMode: nextState === "agent_connected" ? "operator" : "ai",
  };
}
