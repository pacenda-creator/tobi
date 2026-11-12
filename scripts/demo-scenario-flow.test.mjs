import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDemoScenarioTransition,
  findExplicitDemoScenario,
  instantiateDemoResponse,
} from "../lib/demo-scenario-catalog.ts";

test("billing CTA výslovně otevírá Můj Vodafone v nové kartě a zachovává ostatní akce", () => {
  const billing = findExplicitDemoScenario("vyúčtování");
  assert.ok(billing);
  const response = instantiateDemoResponse(billing);
  assert.deepEqual(response.blocks.find((block) => block.type === "action"), {
    type: "action",
    id: "answer-action",
    label: "Otevřít Můj Vodafone v nové kartě",
    action: { kind: "openUrl", url: "https://muj.vodafone.cz/", external: true },
  });
  assert.equal(response.text, "Vyúčtování zobrazíte a zaplatíte v Můj Vodafone nebo v aplikaci Můj Vodafone+.");
  assert.deepEqual(response.quickReplies.map((reply) => reply.label), ["Najít vyúčtování", "Platba se nepropsala", "Vysvětlit částku"]);
  const esim = findExplicitDemoScenario("esim");
  assert.ok(esim);
  assert.deepEqual(instantiateDemoResponse(esim).blocks.find((block) => block.type === "action"), {
    type: "action",
    id: "answer-action",
    label: "Otevřít Můj Vodafone",
    action: { kind: "openUrl", url: "https://muj.vodafone.cz/", external: true },
  });
});

test("internetové flow projde od prvního dotazu přes restart až po vyřešení", () => {
  const initialMatch = findExplicitDemoScenario("Nefunguje mi internet doma.");
  assert.ok(initialMatch);

  const initialResponse = instantiateDemoResponse(initialMatch);
  assert.deepEqual(initialResponse.conversationState, {
    scenarioId: "demo-internet",
    stepId: "photo-offer",
    choices: [],
    allowedTransitionIds: ["internet-photo-skip"],
  });
  assert.deepEqual(initialResponse.quickReplies.map((reply) => reply.label), ["Přidat fotku modemu", "Pokračovat bez fotky"]);
  assert.equal(initialResponse.quickReplies[0].action.kind, "requestUpload");
  const skipPhotoReply = initialResponse.quickReplies.find((reply) => reply.label === "Pokračovat bez fotky");
  assert.equal(skipPhotoReply?.action.transitionId, "internet-photo-skip");

  const textPath = applyDemoScenarioTransition(initialResponse.conversationState, skipPhotoReply.action.transitionId);
  assert.equal(textPath.ok, true);
  assert.equal(textPath.kind, "step");
  assert.equal(textPath.conversationState.stepId, "text-path");
  const textResponse = instantiateDemoResponse(textPath.match, textPath.conversationState);
  const restartReply = textResponse.quickReplies.find((reply) => reply.label === "Ne, stále nefunguje");
  assert.equal(restartReply?.action.transitionId, "internet-not-resolved");

  const afterRestart = applyDemoScenarioTransition(textResponse.conversationState, restartReply.action.transitionId);
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.kind, "step");
  assert.equal(afterRestart.conversationState.stepId, "after-restart");
  assert.deepEqual(afterRestart.conversationState.choices, [
    { transitionId: "internet-photo-skip", fromStepId: "photo-offer", toStepId: "text-path" },
    { transitionId: "internet-not-resolved", fromStepId: "text-path", toStepId: "after-restart" },
  ]);

  const restartResponse = instantiateDemoResponse(afterRestart.match, afterRestart.conversationState);
  const resolvedReply = restartResponse.quickReplies.find((reply) => reply.label === "Funguje na jiném zařízení");
  assert.equal(resolvedReply?.action.transitionId, "internet-other-device-works");

  const resolved = applyDemoScenarioTransition(restartResponse.conversationState, resolvedReply.action.transitionId);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.kind, "step");
  assert.equal(resolved.conversationState.stepId, "resolved");
  assert.equal(resolved.conversationState.choices.length, 3);

  const finalResponse = instantiateDemoResponse(resolved.match, resolved.conversationState);
  assert.match(finalResponse.text, /internet už funguje/i);
  assert.deepEqual(finalResponse.quickReplies, []);
});

test("stavový model odmítne přechod, který není v aktuálním kroku povolený", () => {
  const initialMatch = findExplicitDemoScenario("Nefunguje mi internet doma.");
  assert.ok(initialMatch);
  const initialState = instantiateDemoResponse(initialMatch).conversationState;

  const tamperedState = {
    ...initialState,
    allowedTransitionIds: [...initialState.allowedTransitionIds, "internet-other-device-works"],
  };
  assert.deepEqual(applyDemoScenarioTransition(tamperedState, "internet-other-device-works"), {
    ok: false,
    reason: "transition_not_allowed",
  });
});

test("stavový model odmítne podvrženou historii předchozích voleb", () => {
  const forgedState = {
    scenarioId: "demo-internet",
    stepId: "after-restart",
    choices: [],
    allowedTransitionIds: ["internet-all-devices-offline", "internet-other-device-works"],
  };
  assert.deepEqual(applyDemoScenarioTransition(forgedState, "internet-other-device-works"), {
    ok: false,
    reason: "invalid_history",
  });
});
