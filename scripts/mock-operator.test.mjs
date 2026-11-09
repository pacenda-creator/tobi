import assert from "node:assert/strict";
import test from "node:test";

import { deterministicOperatorReply, isOperatorRequest, MOCK_AGENT_CONNECT_DELAY_MS } from "../lib/mock-operator.ts";
import { nextOperatorSessionState } from "../lib/operator-session.ts";

test("rozpozná běžné české požadavky na živého operátora", () => {
  for (const phrase of [
    "Chci operátora.",
    "Spoj mě s člověkem.",
    "Chci mluvit s živým agentem.",
    "Můžu mluvit s někým z podpory?",
  ]) assert.equal(isOperatorRequest(phrase), true, phrase);
  assert.equal(isOperatorRequest("Jak změním fakturační adresu?"), false);
});

test("doba mock připojení je definovaná na jednom místě", () => {
  assert.equal(MOCK_AGENT_CONNECT_DELAY_MS, 5_000);
});

test("deterministický fallback pokryje referenční rozhovor", () => {
  assert.match(deterministicOperatorReply("Dobrý den, jak se dnes máte?"), /mám se dobře/i);
  assert.match(deterministicOperatorReply("Už mi internet funguje."), /ráda slyším/i);
  assert.match(deterministicOperatorReply("Ne, děkuji."), /hezký den/i);
  assert.match(deterministicOperatorReply("Změňte mi tarif."), /nemám přístup/i);
});

test("stavový model dovolí pouze definované přechody", () => {
  assert.equal(nextOperatorSessionState("bot_active", "request_handover"), "handover_requested");
  assert.equal(nextOperatorSessionState("handover_requested", "queue_started"), "waiting_for_agent");
  assert.equal(nextOperatorSessionState("waiting_for_agent", "agent_connected"), "agent_connected");
  assert.equal(nextOperatorSessionState("agent_connected", "agent_disconnected"), "conversation_ended");
  assert.equal(nextOperatorSessionState("conversation_ended", "new_chat"), "bot_active");
  assert.equal(nextOperatorSessionState("waiting_for_agent", "cancel_waiting"), "bot_active");
  assert.equal(nextOperatorSessionState("agent_connected", "new_chat"), null);
  assert.equal(nextOperatorSessionState("conversation_ended", "agent_message"), null);
});
