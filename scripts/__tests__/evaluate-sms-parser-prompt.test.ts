import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  calibratePromptTokenReport,
  comparePromptVariants,
  estimatePromptTokenReport,
  evaluatePromptFiles,
  loadCurrentPromptVariant,
  type PromptCorpusCase,
  type PromptVariant,
} from "../evaluate-sms-parser-prompt";
import {
  BUILT_IN_SMS_CATEGORY_TREE,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
  DEFAULT_SMS_CURRENCIES,
} from "../../supabase/functions/_shared/sms-ai/sms-ai-prompt";

const currentPrompt: PromptVariant = {
  name: "current",
  fixedInstructions: "Only parse completed transactions.",
  categoryTree: "EXPENSE: food, transport",
  schema: { properties: { transactions: { type: "array" } } },
};

const candidatePrompt: PromptVariant = {
  ...currentPrompt,
  name: "candidate",
  fixedInstructions: "Parse completed transactions.",
};

const corpus: readonly PromptCorpusCase[] = [
  {
    id: "purchase",
    candidatePayload: "Purchase EGP 25 at TEST MARKET",
    expectedOutput: {
      transactions: [{ messageId: "purchase", isTrusted: true }],
    },
    currentOutput: {
      transactions: [{ messageId: "purchase", isTrusted: true }],
    },
    candidateOutput: {
      transactions: [{ messageId: "purchase", isTrusted: true }],
    },
  },
  {
    id: "offer",
    candidatePayload: "Enjoy up to EGP 100 cashback",
    expectedOutput: { transactions: [] },
    currentOutput: { transactions: [] },
    candidateOutput: {
      transactions: [{ messageId: "offer", isTrusted: false }],
    },
  },
];

test("decomposes deterministic local token estimates by prompt section and corpus", () => {
  const first = estimatePromptTokenReport({
    prompt: currentPrompt,
    corpus,
  });
  const second = estimatePromptTokenReport({
    prompt: currentPrompt,
    corpus,
  });

  assert.deepEqual(first, second);
  assert.equal(first.estimator, "local-conservative");
  assert.equal(first.fixtureCorpus.fixtureCount, 2);
  assert.ok(first.fixedInstructions.tokens > 0);
  assert.ok(first.categoryTree.tokens > 0);
  assert.ok(first.schema.tokens > 0);
  assert.equal(
    first.totalTokens,
    first.fixedInstructions.tokens +
      first.categoryTree.tokens +
      first.schema.tokens +
      first.fixtureCorpus.tokens
  );
});

test("local estimation is deterministic for UTF-8 fixture content", () => {
  const report = estimatePromptTokenReport({
    prompt: {
      ...currentPrompt,
      fixedInstructions: "تم خصم المبلغ بعد إتمام العملية.",
    },
    corpus: [corpus[0]],
  });

  assert.equal(report.estimator, "local-conservative");
  assert.equal(report.fixtureCorpus.fixtureCount, 1);
  assert.ok(
    report.fixedInstructions.bytes > report.fixedInstructions.characters
  );
});

test("loads the current production prompt as data without invoking the Edge function", () => {
  const prompt = loadCurrentPromptVariant();

  assert.equal(prompt.name, "current");
  assert.match(prompt.fixedInstructions, /You are Monyvi AI/);
  assert.equal(prompt.categoryTree, BUILT_IN_SMS_CATEGORY_TREE.trim());
  assert.deepEqual(prompt.schema, buildSmsAiResponseSchema(DEFAULT_SMS_CURRENCIES));
  assert.equal(
    prompt.fixedInstructions,
    buildSmsAiStableSystemPrompt(DEFAULT_SMS_CURRENCIES).replace(
      `BUILT-IN CATEGORY TREE:\n${prompt.categoryTree}`,
      ""
    )
  );
});

test("file evaluation rejects DeepInfra calibration without a model-specific counter", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "sms-prompt-test-"));
  writeFileSync(
    path.join(temporaryDirectory, "candidate.json"),
    JSON.stringify(candidatePrompt)
  );
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("unexpected_provider_request");
  };

  try {
    await assert.rejects(
      evaluatePromptFiles({
        rootDirectory: temporaryDirectory,
        candidatePath: "candidate.json",
        calibrate: true,
        model: "deepseek-ai/DeepSeek-V4-Flash-0731",
        apiKey: "unused-test-key",
      }),
      /selected_model_calibration_unsupported_model/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("explicit Gemini file calibration uses countTokens without content generation", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "sms-prompt-test-"));
  writeFileSync(
    path.join(temporaryDirectory, "candidate.json"),
    JSON.stringify(candidatePrompt)
  );
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init): Promise<Response> => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as unknown,
    });
    return new Response(JSON.stringify({ totalTokens: 3 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await evaluatePromptFiles({
      rootDirectory: temporaryDirectory,
      candidatePath: "candidate.json",
      calibrate: true,
      model: "gemini-2.5-flash-lite",
      apiKey: "unused-test-key",
    });
    assert.equal(result.mode, "selected-model-count-tokens");
    assert.equal(result.comparison.current.model, "gemini-2.5-flash-lite");
    assert.equal(requests.length, 8);
    for (const request of requests) {
      assert.match(request.url, /gemini-2\.5-flash-lite:countTokens/);
      assert.doesNotMatch(request.url, /:generateContent/);
      assert.deepEqual(Object.keys(request.body as Record<string, unknown>), [
        "generateContentRequest",
      ]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("selected-model calibration is impossible without explicit opt-in", async () => {
  let calls = 0;
  const countTokens = async (): Promise<number> => {
    calls += 1;
    return 1;
  };

  await assert.rejects(
    calibratePromptTokenReport({
      prompt: currentPrompt,
      corpus,
      model: "test-model",
      enabled: false,
      countTokens,
    }),
    /selected_model_calibration_requires_explicit_opt_in/
  );
  assert.equal(calls, 0);
});

test("selected-model calibration calls count-tokens only and preserves decomposition", async () => {
  const requests: string[] = [];
  const report = await calibratePromptTokenReport({
    prompt: currentPrompt,
    corpus,
    model: "test-model",
    enabled: true,
    countTokens: async ({ text }): Promise<number> => {
      requests.push(text);
      return text.length;
    },
  });

  assert.equal(report.estimator, "selected-model-count-tokens");
  assert.equal(requests.length, 4);
  assert.equal(report.fixtureCorpus.fixtureCount, 2);
  assert.ok(report.totalTokens > 0);
  assert.equal(
    requests.some((request) => request.includes("generateContent")),
    false
  );
});

test("recommendation requires zero expected-output parity regressions", () => {
  const report = comparePromptVariants({
    current: currentPrompt,
    candidate: candidatePrompt,
    corpus,
  });

  assert.equal(report.parity.candidateFailures.length, 1);
  assert.equal(report.parity.regressions.length, 1);
  assert.equal(report.recommendation, "do_not_recommend");
});

test("recommendation is allowed only when both variants match the agreed corpus", () => {
  const passingCorpus = corpus.map((item) => ({
    ...item,
    candidateOutput: item.expectedOutput,
  }));
  const report = comparePromptVariants({
    current: currentPrompt,
    candidate: candidatePrompt,
    corpus: passingCorpus,
  });

  assert.equal(report.parity.currentFailures.length, 0);
  assert.equal(report.parity.candidateFailures.length, 0);
  assert.equal(report.parity.regressions.length, 0);
  assert.equal(report.recommendation, "recommend");
});

test("missing output snapshots cannot establish parity", () => {
  const report = comparePromptVariants({
    current: currentPrompt,
    candidate: candidatePrompt,
    corpus: [
      {
        id: "missing",
        candidatePayload: "synthetic",
        expectedOutput: { transactions: [] },
      },
    ],
  });

  assert.equal(report.parity.status, "not_evaluated");
  assert.equal(report.recommendation, "do_not_recommend");
});
