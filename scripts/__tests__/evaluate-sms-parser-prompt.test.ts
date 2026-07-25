import assert from "node:assert/strict";
import test from "node:test";
import {
  calibratePromptTokenReport,
  comparePromptVariants,
  estimatePromptTokenReport,
  loadCurrentPromptVariant,
  type PromptCorpusCase,
  type PromptVariant,
} from "../evaluate-sms-parser-prompt";

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
  const prompt = loadCurrentPromptVariant("E:/Work/My Projects/Monyvi");

  assert.equal(prompt.name, "current");
  assert.match(prompt.fixedInstructions, /You are Monyvi AI/);
  assert.match(prompt.categoryTree, /food_drinks/);
  assert.equal(typeof prompt.schema, "object");
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
      model: "gemini-test",
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
    model: "gemini-test",
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
