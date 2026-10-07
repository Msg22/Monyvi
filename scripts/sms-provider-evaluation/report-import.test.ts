import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredEvaluationReport } from "./report-import.ts";
import { runSmsProviderEvaluation } from "./runner.ts";
import {
  EvaluationReportImportSchema,
  type EvaluationReport,
} from "./types.ts";

const ANCHOR_MS = Date.parse("2026-10-01T17:00:00.000Z");

async function createDryReport(): Promise<EvaluationReport> {
  return await runSmsProviderEvaluation(
    {
      mode: "dry-run",
      runId: "report-roundtrip",
      anchorMs: ANCHOR_MS,
      maxCases: 6,
      maxRequests: 2,
    },
    {
      fetch: (): Promise<Response> =>
        Promise.reject(new Error("dry_report_must_not_fetch")),
      now: (): number => ANCHOR_MS,
    }
  );
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

void test("saved report roundtrip preserves case metadata and explicit absent card expectation without rerun", async () => {
  const report = await createDryReport();
  const parsed = parseStoredEvaluationReport(cloneJson(report));

  assert.equal(parsed.runId, report.runId);
  assert.equal(parsed.cases.length, report.cases.length);
  const source = report.cases.find(
    (item) =>
      item.expected.kind === "transaction" &&
      item.expected.fields.cardLast4.kind === "exact" &&
      item.expected.fields.cardLast4.value === undefined
  );
  if (source === undefined) throw new Error("absent_card_expectation_missing");

  const restored = parsed.cases.find(({ caseId }) => caseId === source.caseId);
  if (restored === undefined) throw new Error("restored_case_missing");
  assert.equal(restored.source, "synthetic");
  assert.equal(restored.templateGroup, source.templateGroup);
  assert.equal(restored.provenance, source.provenance);
  assert.equal(restored.holdout, source.holdout);
  assert.deepEqual(restored.tags, source.tags);
  assert.equal(restored.receivedDate, source.receivedDate);
  assert.equal(restored.smsFingerprint, source.smsFingerprint);
  if (restored.expected.kind !== "transaction") {
    throw new Error("restored_transaction_expectation_missing");
  }
  assert.equal(restored.expected.fields.cardLast4.kind, "exact");
  if (restored.expected.fields.cardLast4.kind === "exact") {
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        restored.expected.fields.cardLast4,
        "value"
      ),
      true
    );
    assert.equal(restored.expected.fields.cardLast4.value, undefined);
  }
});

void test("external saved-report schema rejects malformed expected/case/manifest/aggregate structures", async () => {
  const report = await createDryReport();

  const malformedExpected = cloneJson(report) as Record<string, unknown>;
  const expectedCases = malformedExpected.cases as Array<Record<string, unknown>>;
  expectedCases[0] = {
    ...expectedCases[0],
    expected: {
      kind: "transaction",
      fields: {},
    },
  };

  const duplicateCase = cloneJson(report) as Record<string, unknown>;
  const duplicateCases = duplicateCase.cases as unknown[];
  duplicateCases.push(duplicateCases[0]);

  const unknownManifestCase = cloneJson(report) as Record<string, unknown>;
  const manifest = unknownManifestCase.rawAttributionManifest as Array<
    Record<string, unknown>
  >;
  if (manifest[0] === undefined) throw new Error("manifest_missing");
  manifest[0] = {
    ...manifest[0],
    caseIds: ["case-not-in-report"],
  };

  const malformedAggregate = cloneJson(report) as Record<string, unknown>;
  malformedAggregate.aggregate = {
    ...(malformedAggregate.aggregate as Record<string, unknown>),
    precision: "perfect",
  };

  for (const value of [
    malformedExpected,
    duplicateCase,
    unknownManifestCase,
    malformedAggregate,
  ]) {
    assert.equal(EvaluationReportImportSchema.safeParse(value).success, false);
    assert.throws(
      () => parseStoredEvaluationReport(value),
      /sms_provider_evaluation_saved_report_invalid/
    );
  }
});
