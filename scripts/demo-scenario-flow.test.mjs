import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDemoScenarioTransition,
  findExplicitDemoScenario,
  instantiateDemoResponse,
} from "../lib/demo-scenario-catalog.ts";

test("internetové flow projde od prvního dotazu přes restart až po vyřešení", () => {
  const initialMatch = findExplicitDemoScenario("Nefunguje mi internet doma.");
  assert.ok(initialMatch);

  const initialResponse = instantiateDemoResponse(initialMatch);
  assert.deepEqual(initialResponse.conversationState, {
    scenarioId: "demo-internet",
    stepId: "initial",
    choices: [],
    allowedTransitionIds: ["internet-resolved", "internet-not-resolved"],
  });
  const restartReply = initialResponse.quickReplies.find((reply) => reply.label === "Ne, stále nefunguje");
  assert.equal(restartReply?.action.transitionId, "internet-not-resolved");

  const afterRestart = applyDemoScenarioTransition(initialResponse.conversationState, restartReply.action.transitionId);
  assert.equal(afterRestart.ok, true);
  assert.equal(afterRestart.kind, "step");
  assert.equal(afterRestart.conversationState.stepId, "after-restart");
  assert.deepEqual(afterRestart.conversationState.choices, [{
    transitionId: "internet-not-resolved",
    fromStepId: "initial",
    toStepId: "after-restart",
  }]);

  const restartResponse = instantiateDemoResponse(afterRestart.match, afterRestart.conversationState);
  const resolvedReply = restartResponse.quickReplies.find((reply) => reply.label === "Funguje na jiném zařízení");
  assert.equal(resolvedReply?.action.transitionId, "internet-other-device-works");

  const resolved = applyDemoScenarioTransition(restartResponse.conversationState, resolvedReply.action.transitionId);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.kind, "step");
  assert.equal(resolved.conversationState.stepId, "resolved");
  assert.equal(resolved.conversationState.choices.length, 2);

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
