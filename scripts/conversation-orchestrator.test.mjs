import assert from "node:assert/strict";
import test from "node:test";

import { decideConversationRoute } from "../lib/conversation-orchestrator.mts";

function request(messages) {
  return { contractVersion: "1", messages, context: { locale: "cs-CZ", channel: "web" } };
}

const internetMatch = { scenario: { id: "demo-internet" }, state: { id: "initial" } };
test("orchestrator zvolí scenario pro explicitně známý demo scénář", () => {
  const decision = decideConversationRoute(request([{ role: "user", content: "Nefunguje mi internet doma." }]), {
    explicit: (input) => input === "Nefunguje mi internet doma." ? internetMatch : null,
  });
  assert.equal(decision.route, "scenario");
  assert.equal(decision.reason, "explicit_demo");
});

test("orchestrator zvolí rag pro volný konkrétní dotaz", () => {
  const decision = decideConversationRoute(request([{ role: "user", content: "Jak změním fakturační adresu u firemního účtu?" }]), {
    explicit: () => null,
  });
  assert.equal(decision.route, "rag");
  assert.equal(decision.reason, "free_query");
});

test("orchestrator zvolí clarification pro nejasný dotaz", () => {
  const decision = decideConversationRoute(request([{ role: "user", content: "Pomoc" }]), {
    explicit: () => null,
  });
  assert.equal(decision.route, "clarification");
  assert.equal(decision.reason, "ambiguous_query");
});

test("orchestrator se doptá na obecný problém s telefonem", () => {
  const decision = decideConversationRoute(request([{ role: "user", content: "Nefunguje mi telefon." }]), {
    explicit: () => null,
  });
  assert.equal(decision.route, "clarification");
  assert.equal(decision.reason, "ambiguous_query");
});

test("orchestrator neodvozuje pokračování flow z textové historie", () => {
  const messages = [
    { role: "user", content: "Nefunguje mi internet doma." },
    { role: "assistant", content: "Pojďme to spolu vyřešit. Zkuste tyto kroky:" },
    { role: "user", content: "Pevný internet stále nefunguje. Potřebuji pokračovat v diagnostice." },
  ];
  const decision = decideConversationRoute(request(messages), {
    explicit: () => null,
  });
  assert.equal(decision.route, "rag");
  assert.equal(decision.reason, "free_query");
});
