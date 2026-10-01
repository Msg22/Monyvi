import assert from "node:assert/strict";
import test from "node:test";

import { computeSmsFingerprintAtEdge } from "../../supabase/functions/_shared/sms-fingerprint-at-edge.ts";
import { parseProviderInputObservationImport } from "./provider-input-observation.ts";
import type { SyntheticEvaluationCase } from "./types.ts";

async function syntheticCase(
  caseId: string,
  sender: string,
  body: string,
  date: string
): Promise<SyntheticEvaluationCase> {
  return {
    caseId,
    providerId: "qnb-egypt",
    templateGroup: "provider-input-red",
    source: "synthetic",
    provenance: "synthetic-template-v1",
    holdout: false,
    tags: ["provider_input"],
    message: {
      id: caseId,
      sender,
      body,
      date,
      smsFingerprint: await computeSmsFingerprintAtEdge({
        sender,
        body,
        receivedAtMs: Date.parse(date),
      }),
    },
    expected: { kind: "no_transaction" },
  };
}

test("correlates provider input sender/body/date to exact source case IDs without reusing the request digest", async () => {
  const cases = [
    await syntheticCase(
      "case-1",
      "qnb",
      "Payment EGP 10 completed",
      "2026-10-01T16:00:00.000Z"
    ),
    await syntheticCase(
      "case-2",
      "qnb",
      "Payment EGP 20 completed",
      "2026-10-01T16:01:00.000Z"
    ),
  ];
  const parsed = await parseProviderInputObservationImport({
    runId: "run-provider-input",
    cases,
    expectedBatchInputs: new Map([
      [
        "batch-001",
        {
          caseIds: cases.map(({ caseId }) => caseId),
          inputIdentity: "request-input-digest",
        },
      ],
    ]),
    value: {
      runId: "run-provider-input",
      batches: [
        {
          runId: "run-provider-input",
          batchId: "batch-001",
          requestInputIdentity: "request-input-digest",
          smsMessages: cases.map(({ message }) => ({
            sender: message.sender,
            body: message.body,
            date: message.date,
          })),
        },
      ],
    },
  });

  assert.equal(parsed.batches.length, 1);
  const batch = parsed.batches[0];
  if (batch === undefined) throw new Error("provider_input_batch_missing");
  assert.deepEqual(batch.caseIds, ["case-1", "case-2"]);
  assert.equal(batch.requestInputIdentity, "request-input-digest");
  assert.ok(batch.providerInputIdentity.length > 0);
  assert.notEqual(batch.providerInputIdentity, batch.requestInputIdentity);
});

test("rejects unknown or duplicate actual provider inputs after fingerprint correlation", async () => {
  const known = await syntheticCase(
    "case-1",
    "qnb",
    "Payment EGP 10 completed",
    "2026-10-01T16:00:00.000Z"
  );
  const base = {
    runId: "run-provider-input",
    cases: [known],
    expectedBatchInputs: new Map([
      [
        "batch-001",
        {
          caseIds: ["case-1"],
          inputIdentity: "request-input-digest",
        },
      ],
    ]),
  };
  const knownLog = {
    sender: known.message.sender,
    body: known.message.body,
    date: known.message.date,
  };

  await assert.rejects(
    () =>
      parseProviderInputObservationImport({
        ...base,
        value: {
          runId: "run-provider-input",
          batches: [
            {
              runId: "run-provider-input",
              batchId: "batch-001",
              requestInputIdentity: "request-input-digest",
              smsMessages: [knownLog, knownLog],
            },
          ],
        },
      }),
    /sms_provider_evaluation_provider_input_duplicate/
  );

  await assert.rejects(
    () =>
      parseProviderInputObservationImport({
        ...base,
        value: {
          runId: "run-provider-input",
          batches: [
            {
              runId: "run-provider-input",
              batchId: "batch-001",
              requestInputIdentity: "request-input-digest",
              smsMessages: [
                {
                  sender: "qnb",
                  body: "Different message never present in the requested cases",
                  date: "2026-10-01T16:02:00.000Z",
                },
              ],
            },
          ],
        },
      }),
    /sms_provider_evaluation_provider_input_unknown/
  );
});
