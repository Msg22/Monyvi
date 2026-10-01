import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSmsProviderEvaluationCliArgs,
  runSmsProviderEvaluationCli,
  runSmsProviderEvaluationProcessEntry,
  type SmsProviderEvaluationCliDependencies,
  type SmsProviderEvaluationProcessEntryDependencies,
  type SmsProviderEvaluationTerminationSignal,
} from "./evaluate-sms-provider-live.ts";
import {
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
} from "./sms-provider-evaluation/types.ts";

const NOW = Date.parse("2026-10-01T17:00:00.000Z");

interface CliHarness {
  readonly dependency: SmsProviderEvaluationCliDependencies;
  readonly getFetchCalls: () => number;
  readonly stdout: string[];
  readonly stderr: string[];
}

function dependencies(): CliHarness {
  let fetchCalls = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    dependency: {
      fetch: (): Promise<Response> => {
        fetchCalls++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              transactions: [],
              completionStatus: "complete",
              negativeFingerprints: [],
              terminalFingerprints: [],
              unresolvedFingerprints: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      },
      now: (): number => NOW,
      writeStdout: (value: string): void => {
        stdout.push(value);
      },
      writeStderr: (value: string): void => {
        stderr.push(value);
      },
      environment: {
        SMS_PROVIDER_EVAL_ACCESS_TOKEN: "secret-token",
        SMS_PROVIDER_EVAL_PUBLIC_API_KEY: "public-key",
      },
    },
    getFetchCalls: (): number => fetchCalls,
    stdout,
    stderr,
  };
}

void test("CLI defaults to dry-run and requires an explicit --live opt-in for network use", async () => {
  const h = dependencies();
  const report = await runSmsProviderEvaluationCli(
    ["--run-id", "cli-dry", "--max-cases", "10", "--max-requests", "2"],
    h.dependency
  );

  assert.equal(report.mode, "dry-run");
  assert.equal(h.getFetchCalls(), 0);
  assert.ok(h.stdout.join("").includes("cli-dry"));
});

void test("CLI live mode pins staging and reads credentials only from injected environment", () => {
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

void test("CLI rejects non-finite, fractional, zero, and negative limits with the evaluator limit error", () => {
  for (const badValue of ["NaN", "Infinity", "1.5", "0", "-1"]) {
    assert.throws(
      () =>
        parseSmsProviderEvaluationCliArgs(
          ["--max-cases", badValue, "--max-requests", "2"],
          {}
        ),
      /sms_provider_evaluation_invalid_limit/
    );
    assert.throws(
      () =>
        parseSmsProviderEvaluationCliArgs(
          ["--max-cases", "2", "--max-requests", badValue],
          {}
        ),
      /sms_provider_evaluation_invalid_limit/
    );
  }
});

void test("CLI refuses credential flags with a specific argument error and does not echo environment credentials", async () => {
  const h = dependencies();

  assert.throws(
    () =>
      parseSmsProviderEvaluationCliArgs(
        ["--access-token", "do-not-accept-cli-secret"],
        h.dependency.environment
      ),
    /sms_provider_evaluation_unknown_or_forbidden_argument/
  );

  await assert.rejects(
    () =>
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
      ),
    /sms_provider_evaluation_invalid_staging_target/
  );

  const output = h.stdout.join("") + h.stderr.join("");
  assert.equal(output.includes("secret-token"), false);
  assert.equal(output.includes("public-key"), false);
});

void test("CLI can accept an optional manual raw-observation file path without implying raw coverage", () => {
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


void test("CLI accepts provider-input evidence separately from raw response evidence", () => {
  const parsed = parseSmsProviderEvaluationCliArgs(
    [
      "--run-id",
      "raw-run",
      "--max-cases",
      "10",
      "--max-requests",
      "2",
      "--raw-observations",
      "tmp/raw-output.json",
      "--provider-input-observations",
      "tmp/provider-input.json",
    ],
    {}
  );

  assert.equal(parsed.rawObservationPath, "tmp/raw-output.json");
  assert.equal(
    parsed.providerInputObservationPath,
    "tmp/provider-input.json"
  );
});

void test(
  "standalone SIGINT and SIGTERM abort pending live fetch and persist partial JSON with remaining cases unattempted",
  async () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handlers = new Map<
      SmsProviderEvaluationTerminationSignal,
      () => void
    >();
    const forwardedSignals: AbortSignal[] = [];
    let resolveStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const saved = new Map<string, string>();

    const dependencies: SmsProviderEvaluationProcessEntryDependencies = {
      fetch: (_input, init): Promise<Response> => {
        const signalValue = init?.signal;
        if (!(signalValue instanceof AbortSignal)) {
          return Promise.reject(new Error("abort_signal_missing"));
        }
        forwardedSignals.push(signalValue);
        resolveStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          signalValue.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        });
      },
      now: (): number => NOW,
      writeStdout: (): void => undefined,
      writeStderr: (): void => undefined,
      environment: {
        SMS_PROVIDER_EVAL_ACCESS_TOKEN: "secret-token",
      },
      registerSignalHandler: (
        registeredSignal: SmsProviderEvaluationTerminationSignal,
        handler: () => void
      ): (() => void) => {
        handlers.set(registeredSignal, handler);
        return (): void => {
          handlers.delete(registeredSignal);
        };
      },
      writeOutputFile: (path: string, value: string): void => {
        saved.set(path, value);
      },
    };

    const runPromise = runSmsProviderEvaluationProcessEntry(
      [
        "--live",
        "--run-id",
        "signal-" + signal.toLowerCase(),
        "--max-cases",
        "10",
        "--max-requests",
        "2",
        "--output",
        "partial-" + signal + ".json",
      ],
      dependencies
    );

    await Promise.race([
      started,
      runPromise.then(
        () => Promise.reject(new Error("process_entry_completed_before_fetch")),
        (error: unknown) =>
          Promise.reject(
            error instanceof Error ? error : new Error(String(error))
          )
      ),
    ]);

    const forwardedSignal = forwardedSignals[0] ?? null;
    assert.equal(forwardedSignal instanceof AbortSignal, true);
    const handler = handlers.get(signal);
    if (handler === undefined) throw new Error("signal_handler_missing");
    handler();

    const report = await runPromise;
    assert.equal(report.cancelled, true);
    assert.ok(
      report.cases.some(
        ({ finalClassification }) => finalClassification === "unattempted"
      )
    );

    const serialized = saved.get("partial-" + signal + ".json");
    if (serialized === undefined) throw new Error("partial_report_not_saved");
    const savedReport = JSON.parse(serialized) as { cancelled?: unknown };
    assert.equal(savedReport.cancelled, true);
    }
  }
);
