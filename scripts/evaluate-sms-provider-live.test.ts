import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSmsProviderEvaluationCliArgs,
  runSmsProviderEvaluationCli,
} from "./evaluate-sms-provider-live.ts";
import {
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
} from "./sms-provider-evaluation/types.ts";

const NOW = Date.parse("2026-10-01T17:00:00.000Z");

function dependencies() {
  let fetchCalls = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    dependency: {
      fetch: async () => {
        fetchCalls++;
        return new Response(
          JSON.stringify({
            transactions: [],
            completionStatus: "complete",
            negativeFingerprints: [],
            terminalFingerprints: [],
            unresolvedFingerprints: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
      now: () => NOW,
      writeStdout: (value: string) => stdout.push(value),
      writeStderr: (value: string) => stderr.push(value),
      environment: {
        SMS_PROVIDER_EVAL_ACCESS_TOKEN: "secret-token",
        SMS_PROVIDER_EVAL_PUBLIC_API_KEY: "public-key",
      },
    },
    getFetchCalls: () => fetchCalls,
    stdout,
    stderr,
  };
}

test("CLI defaults to dry-run and requires an explicit --live opt-in for network use", async () => {
  const h = dependencies();
  const report = await runSmsProviderEvaluationCli(
    ["--run-id", "cli-dry", "--max-cases", "10", "--max-requests", "2"],
    h.dependency
  );

  assert.equal(report.mode, "dry-run");
  assert.equal(h.getFetchCalls(), 0);
  assert.ok(h.stdout.join("").includes("cli-dry"));
});

test("CLI live mode pins staging and reads credentials only from injected environment", () => {
  const parsed = parseSmsProviderEvaluationCliArgs(
    [
      "--live",
      "--run-id",
      "cli-live",
      "--max-cases",
      "10",
      "--max-requests",
      "2",
    ],
    {
      SMS_PROVIDER_EVAL_ACCESS_TOKEN: "secret-token",
      SMS_PROVIDER_EVAL_PUBLIC_API_KEY: "public-key",
    }
  );

  assert.equal(parsed.mode, "live");
  assert.equal(parsed.projectRef, STAGING_PROJECT_REF);
  assert.equal(parsed.endpoint, STAGING_PARSE_SMS_ENDPOINT);
  assert.equal(parsed.accessToken, "secret-token");
  assert.equal(parsed.publicApiKey, "public-key");
});

test("CLI refuses credential flags and does not echo environment credentials in output", async () => {
  const h = dependencies();

  assert.throws(() =>
    parseSmsProviderEvaluationCliArgs(
      ["--access-token", "do-not-accept-cli-secret"],
      h.dependency.environment
    )
  );

  await assert.rejects(() =>
    runSmsProviderEvaluationCli(
      [
        "--live",
        "--run-id",
        "bad-live",
        "--max-cases",
        "10",
        "--max-requests",
        "2",
        "--endpoint",
        "https://evil.example/functions/v1/parse-sms",
      ],
      h.dependency
    )
  );

  const output = h.stdout.join("") + h.stderr.join("");
  assert.equal(output.includes("secret-token"), false);
  assert.equal(output.includes("public-key"), false);
});

test("CLI can accept an optional manual raw-observation file path without implying raw coverage", () => {
  const parsed = parseSmsProviderEvaluationCliArgs(
    [
      "--run-id",
      "raw-run",
      "--max-cases",
      "10",
      "--max-requests",
      "2",
      "--raw-observations",
      "tmp/raw-observations.json",
    ],
    {}
  );

  assert.equal(parsed.rawObservationPath, "tmp/raw-observations.json");
  assert.equal(parsed.mode, "dry-run");
});
