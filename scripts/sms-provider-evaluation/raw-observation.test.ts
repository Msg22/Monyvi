import assert from "node:assert/strict";
import test from "node:test";

import { parseRawObservationImport } from "./raw-observation.ts";
import type { SyntheticEvaluationCase } from "./types.ts";

const CASES: readonly SyntheticEvaluationCase[] = [
  {
    caseId: "case-1",
    providerId: "qnb-egypt",
    templateGroup: "raw",
    source: "synthetic",
    provenance: "synthetic-template-v1",
    holdout: false,
    tags: ["purchase"],
    message: {
      id: "case-1",
      sender: "qnb",
      body: "Purchase EGP 100 at Merchant",
      date: "2026-10-01T16:00:00.000Z",
      smsFingerprint: "fingerprint-1",
    },
    expected: { kind: "no_transaction" },
  },
];

const EXPECTED = new Map([
  [
    "batch-1",
    {
      caseIds: ["case-1"],
      inputIdentity: "input-1",
    },
  ],
]);

test("accepts only raw observations attributed to the same run, batch, case list, and input identity", () => {
  const parsed = parseRawObservationImport({
    runId: "run-1",
    cases: CASES,
    expectedBatchInputs: EXPECTED,
    value: {
      runId: "run-1",
      batches: [
        {
          runId: "run-1",
          batchId: "batch-1",
          caseIds: ["case-1"],
          inputIdentity: "input-1",
          responseContent: '{"transactions":[]}',
        },
      ],
    },
  });

  assert.equal(parsed.batches.length, 1);
  assert.equal(parsed.batches[0]?.responseContent, '{"transactions":[]}');
});

test("rejects malformed imports and never attaches another run or ambiguous batch identity", () => {
  for (const value of [
    null,
    true,
    42,
    "malformed",
    [],
    {},
    {
      runId: "other-run",
      batches: [
        {
          runId: "other-run",
          batchId: "batch-1",
          caseIds: ["case-1"],
          inputIdentity: "input-1",
          responseContent: '{"transactions":[]}',
        },
      ],
    },
    {
      runId: "run-1",
      batches: [
        {
          runId: "run-1",
          batchId: "batch-1",
          caseIds: ["case-1"],
          inputIdentity: "wrong-input",
          responseContent: '{"transactions":[]}',
        },
      ],
    },
    {
      runId: "run-1",
      batches: [
        {
          runId: "run-1",
          batchId: "unknown-batch",
          caseIds: ["case-1"],
          inputIdentity: "input-1",
          responseContent: '{"transactions":[]}',
        },
      ],
    },
  ]) {
    assert.throws(() =>
      parseRawObservationImport({
        runId: "run-1",
        cases: CASES,
        expectedBatchInputs: EXPECTED,
        value,
      })
    );
  }
});
