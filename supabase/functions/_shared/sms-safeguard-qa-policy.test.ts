import assert from "node:assert/strict";
import test from "node:test";

import { SAFEGUARD_QA_SCENARIOS } from "../../../packages/logic/src/sms-safeguards/safeguard-qa-scenarios.ts";
import { getSafeguardQaPolicyAtEdge } from "./sms-safeguard-qa-policy.ts";

test("keeps every Edge QA profile policy aligned with the shared profile definition", () => {
  for (const [profileId, scenario] of Object.entries(SAFEGUARD_QA_SCENARIOS)) {
    const policy = getSafeguardQaPolicyAtEdge(profileId);
    assert.equal(policy.lookbackDays, scenario.policyOverrides.lookbackDays);
    assert.equal(
      policy.checkpointOverlapMs,
      scenario.policyOverrides.checkpointOverlapMs
    );
    assert.equal(
      policy.historyCooldownMs,
      scenario.policyOverrides.historyCooldownMs
    );
    assert.equal(
      policy.negativeStrikeThreshold,
      scenario.policyOverrides.negativeStrikeThreshold
    );
    assert.deepEqual(policy.fullParser, {
      ...policy.fullParser,
      ...scenario.policyOverrides.fullParser,
    });
  }
});

test("rejects unknown profiles instead of falling back to production policy", () => {
  assert.throws(() => getSafeguardQaPolicyAtEdge("unknown"), /profile/i);
});
