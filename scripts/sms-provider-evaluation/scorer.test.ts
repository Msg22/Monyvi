import assert from "node:assert/strict";
import test from "node:test";

import type { ParseSmsProviderTransaction } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider.ts";
import { scoreSmsProviderEvaluation } from "./scorer.ts";
import type {
  EvaluationFieldExpectation,
  FinalBatchObservation,
  RawObservationImport,
  SyntheticEvaluationCase,
} from "./types.ts";

function positiveCase(
  caseId: string,
  options: {
    readonly providerId?: string;
    readonly tags?: readonly string[];
    readonly category?: EvaluationFieldExpectation<string>;
    readonly isAtmWithdrawal?: boolean;
  } = {}
): SyntheticEvaluationCase {
  return {
    caseId,
    providerId: options.providerId ?? "qnb-egypt",
    templateGroup: "development-positive",
    source: "synthetic",
    provenance: "synthetic-template-v1",
    holdout: false,
    tags: options.tags ?? ["purchase"],
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
        categorySystemName: options.category ?? { kind: "unknown" },
        cardLast4: { kind: "unknown" },
        isTrusted: { kind: "exact", value: true },
        isAtmWithdrawal: {
          kind: "exact",
          value: options.isAtmWithdrawal ?? false,
        },
        confidenceScore: { kind: "unknown" },
      },
    },
  };
}

function negativeCase(
  caseId: string,
  providerId = "qnb-egypt",
  tags: readonly string[] = ["otp"]
): SyntheticEvaluationCase {
  const base = positiveCase(caseId, { providerId, tags });
  return {
    ...base,
    expected: { kind: "no_transaction" },
  };
}

function parsedTransaction(
  messageId: string,
  overrides: Partial<ParseSmsProviderTransaction> = {}
): ParseSmsProviderTransaction {
  return {
    messageId,
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: "2026-10-01T16:00:00.000Z",
    categorySystemName: "shopping",
    confidenceScore: 0.7,
    isTrusted: true,
    ...overrides,
  };
}

function observed(
  batchId: string,
  caseIds: readonly string[],
  transactions: readonly ParseSmsProviderTransaction[],
  overrides: Partial<FinalBatchObservation> = {}
): FinalBatchObservation {
  return {
    runId: "run-score",
    batchId,
    caseIds,
    classification: "observed",
    transactions,
    completionStatus: "complete",
    replayProvenance: "confirmed_provider_call",
    ...overrides,
  };
}

function requireCase(
  cases: readonly SyntheticEvaluationCase[],
  index: number
): SyntheticEvaluationCase {
  const value = cases[index];
  if (value === undefined) throw new Error(`missing_case_${index}`);
  return value;
}

test("scores observed positives and negatives by messageId with objective trust/ATM fields and partial denominators", () => {
  const cases = [positiveCase("p1"), negativeCase("n1")];
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed("batch-1", ["p1", "n1"], [parsedTransaction("p1")]),
    ],
  });

  assert.equal(report.aggregate.truePositive, 1);
  assert.equal(report.aggregate.trueNegative, 1);
  assert.equal(report.aggregate.falsePositive, 0);
  assert.equal(report.aggregate.falseNegative, 0);
  assert.equal(report.aggregate.fieldDenominators.categorySystemName, 0);
  assert.equal(report.aggregate.fieldDenominators.amount, 1);
  assert.equal(report.aggregate.fieldDenominators.isTrusted, 1);
  assert.equal(report.aggregate.fieldDenominators.isAtmWithdrawal, 1);
  assert.equal(report.aggregate.fieldDenominators.confidenceScore, 0);
  assert.equal(report.aggregate.fieldCorrect.amount, 1);
  assert.equal(report.aggregate.fieldCorrect.isTrusted, 1);
  assert.equal(report.aggregate.fieldCorrect.isAtmWithdrawal, 1);

  const firstReport = report.cases[0];
  if (firstReport === undefined) throw new Error("missing_first_case_report");
  assert.equal(firstReport.sender, "qnb");
  assert.equal(firstReport.body, "Purchase EGP 100 at Merchant");
  assert.deepEqual(firstReport.expected, requireCase(cases, 0).expected);
  assert.equal(firstReport.mismatches.length, 0);
});

test("counts legitimate observed empty output separately from malformed or unobserved output", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [positiveCase("p1"), negativeCase("n1")],
    finalObservations: [observed("batch-empty", ["p1", "n1"], [])],
  });

  assert.equal(report.aggregate.falseNegative, 1);
  assert.equal(report.aggregate.trueNegative, 1);
  assert.equal(report.classificationSummary.observed, 2);
});

test("does not convert transport, admission, response-invalid, unresolved, suppressed, or unattempted cases into semantic passes or misses", () => {
  const classifications = [
    "transport_failure",
    "admission_failure",
    "response_invalid",
    "unresolved",
    "suppressed",
    "unattempted",
  ] as const;
  const cases = classifications.map((classification, index) =>
    index % 2 === 0
      ? negativeCase(classification)
      : positiveCase(classification)
  );

  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: classifications.map((classification, index) => ({
      runId: "run-score",
      batchId: `batch-${index}`,
      caseIds: [requireCase(cases, index).caseId],
      classification,
      replayProvenance: "unknown",
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
      observed("batch-1", ["p1"], [
        parsedTransaction("p1"),
        parsedTransaction("p1"),
        parsedTransaction("unknown-id"),
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
        category: { kind: "one_of", values: ["shopping", "other"] },
      }),
      positiveCase("unknown", { category: { kind: "unknown" } }),
    ],
    finalObservations: [
      observed("batch-1", ["alt", "unknown"], [
        parsedTransaction("alt", { categorySystemName: "other" }),
        parsedTransaction("unknown", {
          categorySystemName: "utilities_bills",
        }),
      ]),
    ],
  });

  assert.equal(report.aggregate.fieldDenominators.categorySystemName, 1);
  assert.equal(report.aggregate.fieldCorrect.categorySystemName, 1);
});

test("keeps replay provider-call provenance visible instead of treating a response as proof of a fresh call", () => {
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [positiveCase("p1")],
    finalObservations: [
      observed("batch-replay", ["p1"], [], {
        replayProvenance: "unknown",
      }),
    ],
  });

  const first = report.cases[0];
  if (first === undefined) throw new Error("missing_replay_case");
  assert.equal(first.finalClassification, "observed");
  assert.equal(first.replayProvenance, "unknown");
  assert.equal(report.provenanceSummary.unknown, 1);
  assert.equal(report.aggregate.falseNegative, 1);
});

test("scores manually attributed raw output separately from final output with partial raw coverage including raw empty batches", () => {
  const cases = [
    positiveCase("p1"),
    negativeCase("n1"),
    positiveCase("p2"),
  ];
  const rawObservations: RawObservationImport = {
    runId: "run-score",
    batches: [
      {
        runId: "run-score",
        batchId: "raw-1",
        caseIds: ["p1"],
        inputIdentity: "input-p1",
        responseContent: JSON.stringify({
          transactions: [parsedTransaction("p1", { amount: 99 })],
        }),
      },
      {
        runId: "run-score",
        batchId: "raw-2",
        caseIds: ["n1"],
        inputIdentity: "input-n1",
        responseContent: JSON.stringify({ transactions: [] }),
      },
    ],
  };

  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed("raw-1", ["p1"], [parsedTransaction("p1")]),
      observed("raw-2", ["n1"], []),
      observed("raw-3", ["p2"], [parsedTransaction("p2")]),
    ],
    rawObservations,
  });

  assert.equal(report.aggregate.truePositive, 2);
  assert.equal(report.rawAggregate.truePositive, 1);
  assert.equal(report.rawAggregate.trueNegative, 1);
  assert.equal(report.rawAggregate.fieldDenominators.amount, 1);
  assert.equal(report.rawAggregate.fieldCorrect.amount, 0);
  assert.deepEqual(report.rawCoverage, {
    observedBatches: 2,
    totalBatches: 3,
  });

  const p1 = report.cases.find(({ caseId }) => caseId === "p1");
  const p2 = report.cases.find(({ caseId }) => caseId === "p2");
  if (p1 === undefined || p2 === undefined) {
    throw new Error("missing_raw_case_reports");
  }
  assert.equal(p1.raw.status, "observed");
  if (p1.raw.status === "observed") {
    assert.ok(p1.raw.mismatches.some(({ field }) => field === "amount"));
  }
  assert.equal(p2.raw.status, "not_observed");
});

test("reports provider/scenario groups plus classification, batch, provenance, and latency summaries", () => {
  const cases = [
    positiveCase("qnb-purchase", {
      providerId: "qnb-egypt",
      tags: ["purchase", "card"],
    }),
    positiveCase("cib-atm", {
      providerId: "cib",
      tags: ["atm"],
      isAtmWithdrawal: true,
    }),
    negativeCase("cib-otp", "cib", ["otp"]),
  ];

  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed(
        "batch-fast",
        ["qnb-purchase"],
        [parsedTransaction("qnb-purchase")],
        { latencyMs: 100, replayProvenance: "confirmed_provider_call" }
      ),
      observed(
        "batch-slow",
        ["cib-atm", "cib-otp"],
        [
          parsedTransaction("cib-atm", {
            isAtmWithdrawal: true,
          }),
        ],
        { latencyMs: 300, replayProvenance: "unknown" }
      ),
    ],
  });

  assert.deepEqual(
    report.providerSummaries.map(({ key }) => key).sort(),
    ["cib", "qnb-egypt"]
  );
  assert.ok(report.scenarioSummaries.some(({ key }) => key === "atm"));
  assert.ok(report.scenarioSummaries.some(({ key }) => key === "otp"));
  assert.equal(report.classificationSummary.observed, 3);
  assert.equal(report.batchSummaries.length, 2);
  assert.equal(report.provenanceSummary.confirmedProviderCall, 1);
  assert.equal(report.provenanceSummary.unknown, 1);
  assert.deepEqual(report.latencySummary, {
    observedCount: 2,
    minimumMs: 100,
    maximumMs: 300,
    averageMs: 200,
  });
});
