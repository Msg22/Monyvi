import assert from "node:assert/strict";
import test from "node:test";

import type { ParseSmsProviderTransaction } from "../../supabase/functions/_shared/sms-ai/sms-ai-provider.ts";
import { scoreSmsProviderEvaluation } from "./scorer.ts";
import type {
  EvaluationFieldExpectation,
  FinalBatchObservation,
  ProviderInputObservationImport,
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

void test("scores observed positives and negatives by messageId with objective trust/ATM fields and partial denominators", () => {
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

void test("counts legitimate observed empty output separately from malformed or unobserved output", () => {
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

void test("does not convert transport, admission, response-invalid, unresolved, suppressed, or unattempted cases into semantic passes or misses", () => {
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

void test("unknown and duplicate output identities never inflate true positives, recall, or field denominators", () => {
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

void test("accepts explicit category alternatives without treating unknown category purpose as exact truth", () => {
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

void test("keeps replay provider-call provenance visible instead of treating a response as proof of a fresh call", () => {
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

void test("scores manually attributed raw output separately from final output with partial raw coverage including raw empty batches", () => {
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

void test("reports provider/scenario groups plus classification, batch, provenance, and latency summaries", () => {
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


void test("raw accuracy includes only cases proven present in actual provider input evidence", () => {
  const cases = [
    negativeCase("requested-1"),
    negativeCase("requested-2"),
    negativeCase("requested-3"),
    negativeCase("prefiltered-4"),
    negativeCase("prefiltered-5"),
  ];
  const rawObservations: RawObservationImport = {
    runId: "run-score",
    batches: [
      {
        runId: "run-score",
        batchId: "batch-filtered",
        caseIds: cases.map(({ caseId }) => caseId),
        inputIdentity: "request-digest",
        responseContent: JSON.stringify({ transactions: [] }),
      },
    ],
  };
  const providerInputObservations: ProviderInputObservationImport = {
    runId: "run-score",
    batches: [
      {
        runId: "run-score",
        batchId: "batch-filtered",
        requestInputIdentity: "request-digest",
        providerInputIdentity: "provider-input-digest",
        caseIds: ["requested-1", "requested-2", "requested-3"],
      },
    ],
  };

  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed(
        "batch-filtered",
        cases.map(({ caseId }) => caseId),
        []
      ),
    ],
    rawObservations,
    providerInputObservations,
  });

  assert.equal(report.aggregate.trueNegative, 5);
  assert.equal(report.rawAggregate.trueNegative, 3);
  for (const caseId of ["requested-1", "requested-2", "requested-3"]) {
    assert.equal(
      report.cases.find((item) => item.caseId === caseId)?.raw.status,
      "observed"
    );
  }
  for (const caseId of ["prefiltered-4", "prefiltered-5"]) {
    assert.equal(
      report.cases.find((item) => item.caseId === caseId)?.raw.status,
      "not_observed"
    );
  }
});

void test("raw output stays not_observed for a wholly prefiltered batch without provider-input evidence", () => {
  const cases = [negativeCase("otp-filtered"), negativeCase("known-negative")];
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed(
        "batch-no-provider-input",
        cases.map(({ caseId }) => caseId),
        []
      ),
    ],
    rawObservations: {
      runId: "run-score",
      batches: [
        {
          runId: "run-score",
          batchId: "batch-no-provider-input",
          caseIds: cases.map(({ caseId }) => caseId),
          inputIdentity: "request-digest",
          responseContent: JSON.stringify({ transactions: [] }),
        },
      ],
    },
    providerInputObservations: {
      runId: "run-score",
      batches: [],
    },
  });

  assert.equal(report.rawCoverage.observedBatches, 0);
  assert.equal(report.rawAggregate.trueNegative, 0);
  assert.ok(report.cases.every(({ raw }) => raw.status === "not_observed"));
});

void test("duplicate and unknown final outputs penalize precision without inflating TP or field denominators", () => {
  const cases = [positiveCase("p1")];
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [
      observed("batch-excess", ["p1"], [
        parsedTransaction("p1"),
        parsedTransaction("p1"),
        parsedTransaction("unknown-id"),
      ]),
    ],
  });

  assert.equal(report.aggregate.truePositive, 1);
  assert.equal(report.aggregate.falsePositive, 2);
  assert.equal(report.aggregate.precision, 1 / 3);
  assert.equal(report.aggregate.fieldDenominators.amount, 1);
  assert.equal(report.aggregate.duplicateOutputs, 1);
  assert.equal(report.aggregate.unknownMessageIds, 1);

  const provider = report.providerSummaries.find(({ key }) => key === "qnb-egypt");
  if (provider === undefined) throw new Error("provider_summary_missing");
  assert.equal(provider.aggregate.truePositive, 1);
  assert.equal(provider.aggregate.falsePositive, 2);
  assert.equal(provider.aggregate.precision, 1 / 3);
});

void test("duplicate and unknown raw outputs penalize raw precision without inflating raw TP or fields", () => {
  const cases = [positiveCase("p1")];
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases,
    finalObservations: [observed("batch-raw-excess", ["p1"], [parsedTransaction("p1")])],
    rawObservations: {
      runId: "run-score",
      batches: [
        {
          runId: "run-score",
          batchId: "batch-raw-excess",
          caseIds: ["p1"],
          inputIdentity: "request-digest",
          responseContent: JSON.stringify({
            transactions: [
              parsedTransaction("p1"),
              parsedTransaction("p1"),
              parsedTransaction("unknown-id"),
            ],
          }),
        },
      ],
    },
    providerInputObservations: {
      runId: "run-score",
      batches: [
        {
          runId: "run-score",
          batchId: "batch-raw-excess",
          requestInputIdentity: "request-digest",
          providerInputIdentity: "provider-digest",
          caseIds: ["p1"],
        },
      ],
    },
  });

  assert.equal(report.rawAggregate.truePositive, 1);
  assert.equal(report.rawAggregate.falsePositive, 2);
  assert.equal(report.rawAggregate.precision, 1 / 3);
  assert.equal(report.rawAggregate.fieldDenominators.amount, 1);
});

void test("per-case report preserves synthetic provenance, holdout, tags, received date and fingerprint", () => {
  const source = positiveCase("metadata-case", {
    tags: ["holdout", "atm"],
    isAtmWithdrawal: true,
  });
  const decorated: SyntheticEvaluationCase = {
    ...source,
    templateGroup: "holdout-independent-template",
    provenance: "synthetic-reviewed-template-v2",
    holdout: true,
  };
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "dry-run",
    cases: [decorated],
    finalObservations: [],
  });

  const item = report.cases[0];
  if (item === undefined) throw new Error("metadata_case_report_missing");
  assert.equal(item.source, "synthetic");
  assert.equal(item.templateGroup, decorated.templateGroup);
  assert.equal(item.provenance, decorated.provenance);
  assert.equal(item.holdout, true);
  assert.deepEqual(item.tags, decorated.tags);
  assert.equal(item.receivedDate, decorated.message.date);
  assert.equal(item.smsFingerprint, decorated.message.smsFingerprint);
});

void test("policy-heuristic confidence ranges are disclosed but excluded from objective field accuracy", () => {
  const item = positiveCase("heuristic-confidence");
  if (item.expected.kind !== "transaction") {
    throw new Error("heuristic_positive_case_expected");
  }
  const heuristicCase: SyntheticEvaluationCase = {
    ...item,
    expected: {
      kind: "transaction",
      fields: {
        ...item.expected.fields,
        confidenceScore: {
          kind: "range",
          minimum: 0.3,
          maximum: 0.6,
          rationale: "Conservative product policy for ambiguous purpose.",
          basis: "policy_heuristic",
        },
      },
    },
  };
  const report = scoreSmsProviderEvaluation({
    runId: "run-score",
    mode: "live",
    cases: [heuristicCase],
    finalObservations: [
      observed("batch-heuristic", ["heuristic-confidence"], [
        parsedTransaction("heuristic-confidence", { confidenceScore: 0.95 }),
      ]),
    ],
  });

  assert.equal(report.aggregate.truePositive, 1);
  assert.equal(report.aggregate.fieldDenominators.confidenceScore, 0);
  assert.equal(report.aggregate.fieldCorrect.confidenceScore, 0);
});
