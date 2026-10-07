import {
  computeRequestDigestAtEdge,
  computeSmsFingerprintAtEdge,
} from "../../supabase/functions/_shared/sms-fingerprint-at-edge.ts";
import {
  ProviderInputObservationWireSchema,
  type ProviderInputObservationImport,
  type SyntheticEvaluationCase,
} from "./types.ts";

export interface ParseProviderInputObservationImportInput {
  readonly value: unknown;
  readonly runId: string;
  readonly expectedBatchInputs: ReadonlyMap<
    string,
    {
      readonly caseIds: readonly string[];
      readonly inputIdentity: string;
    }
  >;
  readonly cases: readonly Pick<SyntheticEvaluationCase, "caseId" | "message">[];
}

export async function parseProviderInputObservationImport(
  input: ParseProviderInputObservationImportInput
): Promise<ProviderInputObservationImport> {
  const parsed = ProviderInputObservationWireSchema.parse(input.value);
  if (parsed.runId !== input.runId) {
    throw new Error("sms_provider_evaluation_provider_input_run_mismatch");
  }

  const caseByFingerprint = new Map(
    input.cases.map((item) => [item.message.smsFingerprint, item])
  );
  const seenBatches = new Set<string>();
  const batches: ProviderInputObservationImport["batches"][number][] = [];

  for (const batch of parsed.batches) {
    if (batch.runId !== input.runId) {
      throw new Error("sms_provider_evaluation_provider_input_run_mismatch");
    }
    if (seenBatches.has(batch.batchId)) {
      throw new Error("sms_provider_evaluation_provider_input_batch_duplicate");
    }
    seenBatches.add(batch.batchId);

    const expected = input.expectedBatchInputs.get(batch.batchId);
    if (expected === undefined) {
      throw new Error("sms_provider_evaluation_provider_input_batch_unknown");
    }
    if (batch.requestInputIdentity !== expected.inputIdentity) {
      throw new Error(
        "sms_provider_evaluation_provider_input_request_identity_mismatch"
      );
    }

    const allowedCaseIds = new Set(expected.caseIds);
    const caseIds: string[] = [];
    const seenCaseIds = new Set<string>();

    for (const message of batch.smsMessages) {
      const receivedAtMs = Date.parse(message.date);
      if (!Number.isFinite(receivedAtMs)) {
        throw new Error("sms_provider_evaluation_provider_input_unknown");
      }
      const fingerprint = await computeSmsFingerprintAtEdge({
        sender: message.sender,
        body: message.body,
        receivedAtMs,
      });
      const sourceCase = caseByFingerprint.get(fingerprint);
      if (
        sourceCase === undefined ||
        !allowedCaseIds.has(sourceCase.caseId)
      ) {
        throw new Error("sms_provider_evaluation_provider_input_unknown");
      }
      if (seenCaseIds.has(sourceCase.caseId)) {
        throw new Error("sms_provider_evaluation_provider_input_duplicate");
      }
      seenCaseIds.add(sourceCase.caseId);
      caseIds.push(sourceCase.caseId);
    }

    const providerInputIdentity = await computeRequestDigestAtEdge({
      messages: batch.smsMessages,
    });

    batches.push({
      runId: batch.runId,
      batchId: batch.batchId,
      requestInputIdentity: batch.requestInputIdentity,
      providerInputIdentity,
      caseIds,
    });
  }

  return {
    runId: parsed.runId,
    batches,
  };
}
