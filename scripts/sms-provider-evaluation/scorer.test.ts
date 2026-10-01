import assert from "node:assert/strict";
import test from "node:test";

import type {
  FinalBatchObservation,
  SyntheticEvaluationCase,
} from "./types.ts";
import { scoreSmsProviderEvaluation } from "./scorer.ts";

function positiveCase(
  caseId: string,
  category:
    | { readonly kind: "exact"; readonly value: string }
    | { readonly kind: "one_of"; readonly values: readonly string[] }
    | { readonly kind: "unknown" } = { kind: "unknown" }
): SyntheticEvaluationCase {
  return {
    caseId,
    providerId: "qnb-egypt",
    templateGroup: "development-positive",
    source: "synthetic",
    provenance: "synthetic-template-v1",
    holdout: false,
    tags: ["purchase"],
    message: {
      id: caseId,
      sender: "qnb",
      body: "Purchase EGP 100 at Merchant",
      date: "2026-10-01T16:00:00.000Z",
      smsFingerprint: `fingerprint-${caseId}`,
    },
    expected: {
      kind: "transaction",
      fields: {
        amount: { kind: "exact", value: 100 },
        currency: { kind: "exact", value: "EGP" },
        type: { kind: "exact", value: "EXPENSE" },
        date: { kind: "exact", value: "2026-10-01T16:00:00.000Z" },
        counterparty: { kind: "one_of", values: ["Merchant", "MERCHANT"] },
        categorySystemName: category,
        cardLast4: { kind: "unknown" },
        confidenceScore: { kind: "unknown" },
      },
    },
  };
}

function negativeCase(caseId: string): SyntheticEvaluationCase {
  return {
    ...positiveCase(caseId),
    tags: ["otp"],
    expected: { kind: "no_transaction" },
  };
}

function observed(
  caseIds: readonly string[],
  transactions: readonly Record<string, unknown>[]
): FinalBatchObservation {
  return {
    runId: "run-score",
    batchId: "batch-1",
    caseIds,
    classification: "observed",
    transactions: transactions as FinalBatchObservation["transactions"],
    completionStatus: "complete",
    replayProvenance: "confirmed_provider_call",
  };
}

test("scores observed positives and negatives by messageId with partial field denominators", () => {
  const cases = [
    positiveCase("p1", { kind: "unknown" }),
    negativeCase("n1"),
  ];
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed(["p1", "n1"], [
        {
          messageId: "p1",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "shopping",
          confidenceScore: 0.7,
          isTrusted: true,
        },
      ]),
    ],
  });

  assert.equal(report.aggregate.truePositive, 1);
  assert.equal(report.aggregate.trueNegative, 1);
  assert.equal(report.aggregate.falsePositive, 0);
  assert.equal(report.aggregate.falseNegative, 0);
  assert.equal(report.aggregate.fieldDenominators.categorySystemName, 0);
  assert.equal(report.aggregate.fieldDenominators.amount, 1);
  assert.equal(report.aggregate.fieldCorrect.amount, 1);
  assert.equal(report.cases[0]?.sender, "qnb");
  assert.equal(report.cases[0]?.body, "Purchase EGP 100 at Merchant");
  assert.deepEqual(report.cases[0]?.expected, cases[0]?.expected);
  assert.equal(report.cases[0]?.mismatches.length, 0);
});

test("counts legitimate observed empty output as omission for a positive and true negative for a negative", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [positiveCase("p1"), negativeCase("n1")],
    finalObservations: [observed(["p1", "n1"], [])],
  });

  assert.equal(report.aggregate.falseNegative, 1);
  assert.equal(report.aggregate.trueNegative, 1);
});

test("does not convert transport, admission, unresolved, suppressed, or unattempted cases into semantic passes or misses", () => {
  const cases = [
    negativeCase("transport"),
    positiveCase("admission"),
    positiveCase("unresolved"),
    negativeCase("suppressed"),
    positiveCase("unattempted"),
  ];
  const classifications = [
    "transport_failure",
    "admission_failure",
    "unresolved",
    "suppressed",
    "unattempted",
  ] as const;

  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: classifications.map((classification, index) => ({
      runId: "run-score",
      batchId: `batch-${index}`,
      caseIds: [cases[index]!.caseId],
      classification,
    })),
  });

  assert.equal(report.aggregate.truePositive, 0);
  assert.equal(report.aggregate.trueNegative, 0);
  assert.equal(report.aggregate.falsePositive, 0);
  assert.equal(report.aggregate.falseNegative, 0);
  assert.deepEqual(
    report.cases.map(({ finalClassification }) => finalClassification),
    classifications
  );
});

test("unknown and duplicate output identities never inflate true positives, recall, or field denominators", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [positiveCase("p1")],
    finalObservations: [
      observed(["p1"], [
        {
          messageId: "p1",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "shopping",
          confidenceScore: 0.7,
          isTrusted: true,
        },
        {
          messageId: "p1",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "shopping",
          confidenceScore: 0.7,
          isTrusted: true,
        },
        {
          messageId: "unknown-id",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "shopping",
          confidenceScore: 0.7,
          isTrusted: true,
        },
      ]),
    ],
  });

  assert.ok(report.aggregate.truePositive <= 1);
  assert.equal(report.aggregate.duplicateOutputs, 1);
  assert.equal(report.aggregate.unknownMessageIds, 1);
  assert.equal(report.aggregate.fieldDenominators.amount, 1);
  assert.ok(report.aggregate.recall === null || report.aggregate.recall <= 1);
});

test("accepts explicit category alternatives without treating unknown category purpose as exact truth", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [
      positiveCase("alt", {
        kind: "one_of",
        values: ["shopping", "other"],
      }),
      positiveCase("unknown", { kind: "unknown" }),
    ],
    finalObservations: [
      observed(["alt", "unknown"], [
        {
          messageId: "alt",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "other",
          confidenceScore: 0.6,
          isTrusted: true,
        },
        {
          messageId: "unknown",
          amount: 100,
          currency: "EGP",
          type: "EXPENSE",
          counterparty: "Merchant",
          date: "2026-10-01T16:00:00.000Z",
          categorySystemName: "utilities_bills",
          confidenceScore: 0.4,
          isTrusted: true,
        },
      ]),
    ],
  });

  assert.equal(report.aggregate.fieldDenominators.categorySystemName, 1);
  assert.equal(report.aggregate.fieldCorrect.categorySystemName, 1);
});

test("a replay response has unknown provider-call provenance unless correlated evidence proves a fresh call", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [positiveCase("p1")],
    finalObservations: [
      {
        ...observed(["p1"], []),
        replayProvenance: "unknown",
      },
    ],
  });

  assert.equal(report.cases[0]?.finalClassification, "observed");
  assert.equal(report.aggregate.falseNegative, 1);
});
