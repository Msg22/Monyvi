import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SMS_SAFEGUARD_POLICY,
  parseSmsSafeguardPolicy,
  readSmsSafeguardPolicyFromEnvironment,
} from "./sms-safeguard-policy.ts";

test("uses the approved production safeguard limits", () => {
  assert.equal(DEFAULT_SMS_SAFEGUARD_POLICY.lookbackDays, 30);
  assert.equal(DEFAULT_SMS_SAFEGUARD_POLICY.checkpointOverlapMs, 5 * 60 * 1000);
  assert.equal(DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.maxUnitsPerRequest, 50);
  assert.equal(DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.maxUnitsPerScan, 200);
  assert.equal(
    DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.maxUnitsPerRollingWindow,
    200
  );
  assert.equal(
    DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.maxPayloadBytes,
    128 * 1024
  );
  assert.equal(
    DEFAULT_SMS_SAFEGUARD_POLICY.fullParser.maxEstimatedInputTokens,
    32_000
  );
  assert.equal(
    DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment.maxUnitsPerRequest,
    20
  );
  assert.equal(
    DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment.maxUnitsPerRollingWindow,
    100
  );
});

test("rejects malformed policy overrides instead of weakening safeguards", () => {
  assert.throws(
    () =>
      parseSmsSafeguardPolicy({
        ...DEFAULT_SMS_SAFEGUARD_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
          maxUnitsPerRequest: 0,
        },
      }),
    /maxUnitsPerRequest/
  );
});

test("accepts an emergency capability disable without changing other limits", () => {
  const policy = parseSmsSafeguardPolicy({
    ...DEFAULT_SMS_SAFEGUARD_POLICY,
    fullParser: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
      isEnabled: false,
    },
  });

  assert.equal(policy.fullParser.isEnabled, false);
  assert.equal(policy.fullParser.maxUnitsPerRequest, 50);
  assert.equal(policy.categoryEnrichment.isEnabled, true);
});

test("reads independent emergency capability switches from server environment", () => {
  const values = new Map([
    ["SMS_FULL_PARSER_ENABLED", "false"],
    ["SMS_CATEGORY_ENRICHMENT_ENABLED", "true"],
  ]);

  const policy = readSmsSafeguardPolicyFromEnvironment((name) =>
    values.get(name)
  );

  assert.equal(policy.fullParser.isEnabled, false);
  assert.equal(policy.categoryEnrichment.isEnabled, true);
  assert.equal(policy.fullParser.maxUnitsPerRequest, 50);
});

test("fails closed when an emergency capability switch is malformed", () => {
  assert.throws(
    () =>
      readSmsSafeguardPolicyFromEnvironment((name) =>
        name === "SMS_FULL_PARSER_ENABLED" ? "maybe" : undefined
      ),
    /SMS_FULL_PARSER_ENABLED/
  );
});
