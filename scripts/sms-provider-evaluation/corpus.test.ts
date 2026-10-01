import assert from "node:assert/strict";
import test from "node:test";

import {
  EGYPTIAN_FINANCIAL_INSTITUTIONS,
  getSenderPatternsForInstitution,
} from "../../packages/logic/src/parsers/egyptian-bank-registry.ts";
import { computeSmsFingerprintAtEdge } from "../../supabase/functions/_shared/sms-fingerprint-at-edge.ts";
import { buildSyntheticEvaluationCorpus } from "./corpus.ts";

const RUN_ID = "eval-red-corpus";
const ANCHOR_MS = Date.parse("2026-10-01T17:00:00.000Z");

test("derives positive and negative coverage from every currently selectable registry provider", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });
  const selectable = EGYPTIAN_FINANCIAL_INSTITUTIONS.filter(
    (institution) => institution.selectable
  );

  assert.equal(new Set(selectable.map(({ id }) => id)).size, selectable.length);

  for (const institution of selectable) {
    const providerCases = corpus.filter(
      ({ providerId }) => providerId === institution.id
    );
    assert.ok(
      providerCases.some(({ expected }) => expected.kind === "transaction"),
      institution.id
    );
    assert.ok(
      providerCases.some(({ expected }) => expected.kind === "no_transaction"),
      institution.id
    );
  }

  assert.deepEqual(
    [...new Set(corpus.map(({ providerId }) => providerId))].sort(),
    selectable.map(({ id }) => id).sort()
  );
});

test("labels every committed message as synthetic with visible provenance and no answer-signalling body text", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });

  assert.ok(corpus.length > 0);
  for (const item of corpus) {
    assert.equal(item.source, "synthetic");
    assert.ok(item.provenance.length > 0);
    assert.ok(item.templateGroup.length > 0);
    assert.ok(item.tags.length > 0);
    assert.equal(/for testing/i.test(item.message.body), false);
    assert.equal(item.caseId.includes(RUN_ID), true);
  }
});

test("uses independent holdout template groups rather than renamed development templates", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });
  const developmentGroups = new Set(
    corpus.filter(({ holdout }) => !holdout).map(({ templateGroup }) => templateGroup)
  );
  const holdout = corpus.filter(({ holdout }) => holdout);

  assert.ok(holdout.length > 0);
  for (const item of holdout) {
    assert.equal(developmentGroups.has(item.templateGroup), false, item.caseId);
  }
});

test("covers independent edge scenarios and registry aliases without claiming authentic wording", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });
  const requiredTags = [
    "account_only_transfer",
    "conflicting_card_account_suffix",
    "leading_zero_card",
    "generic_gateway_ambiguous_category",
    "arabic_digits_separators",
    "foreign_currency",
    "refund",
    "atm",
    "pending_transaction",
    "failed_transaction",
    "otp",
    "promotion",
  ];

  for (const tag of requiredTags) {
    assert.ok(corpus.some(({ tags }) => tags.includes(tag)), tag);
  }

  const selectableWithAliases = EGYPTIAN_FINANCIAL_INSTITUTIONS.filter(
    (institution) => institution.selectable && institution.senderPatterns.length > 1
  );
  for (const institution of selectableWithAliases) {
    const aliases = new Set(getSenderPatternsForInstitution(institution.id).slice(1));
    assert.ok(
      corpus.some(
        (item) =>
          item.providerId === institution.id &&
          item.tags.includes("sender_alias") &&
          aliases.has(item.message.sender)
      ),
      institution.id
    );
  }
});

test("anchors dates and canonical fingerprints deterministically within a run", async () => {
  const first = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });
  const second = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });

  assert.deepEqual(first, second);

  for (const item of first.slice(0, 10)) {
    const receivedAtMs = Date.parse(item.message.date);
    assert.ok(Number.isFinite(receivedAtMs));
    assert.ok(receivedAtMs <= ANCHOR_MS);
    assert.equal(
      item.message.smsFingerprint,
      await computeSmsFingerprintAtEdge({
        sender: item.message.sender,
        body: item.message.body,
        receivedAtMs,
      })
    );
  }
});

test("a fresh run anchor changes fingerprint identity while keeping the labeled scenario stable", async () => {
  const first = await buildSyntheticEvaluationCorpus({
    runId: "run-a",
    anchorMs: ANCHOR_MS,
  });
  const second = await buildSyntheticEvaluationCorpus({
    runId: "run-b",
    anchorMs: ANCHOR_MS + 60_000,
  });

  assert.equal(first[0]?.providerId, second[0]?.providerId);
  assert.equal(first[0]?.templateGroup, second[0]?.templateGroup);
  assert.equal(first[0]?.message.body, second[0]?.message.body);
  assert.notEqual(first[0]?.message.date, second[0]?.message.date);
  assert.notEqual(
    first[0]?.message.smsFingerprint,
    second[0]?.message.smsFingerprint
  );
});


test("labels objectively knowable trust and ATM state while keeping confidence non-arbitrary", async () => {
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: RUN_ID,
    anchorMs: ANCHOR_MS,
  });
  const positives = corpus.filter(
    (item): item is typeof item & {
      readonly expected: Extract<typeof item.expected, { readonly kind: "transaction" }>;
    } => item.expected.kind === "transaction"
  );

  assert.ok(positives.length > 0);
  for (const item of positives) {
    assert.notEqual(item.expected.fields.isTrusted.kind, "unknown", item.caseId);
    assert.notEqual(
      item.expected.fields.isAtmWithdrawal.kind,
      "unknown",
      item.caseId
    );
    assert.notEqual(item.expected.fields.confidenceScore.kind, "exact", item.caseId);
  }

  const atm = positives.find(({ tags }) => tags.includes("atm"));
  if (atm === undefined) throw new Error("expected_atm_fixture_missing");
  assert.deepEqual(atm.expected.fields.isAtmWithdrawal, {
    kind: "exact",
    value: true,
  });

  const genericGateway = positives.find(({ tags }) =>
    tags.includes("generic_gateway_ambiguous_category")
  );
  if (genericGateway === undefined) {
    throw new Error("expected_generic_gateway_fixture_missing");
  }
  assert.equal(genericGateway.expected.fields.categorySystemName.kind, "unknown");
  assert.equal(genericGateway.expected.fields.confidenceScore.kind, "range");
  if (genericGateway.expected.fields.confidenceScore.kind === "range") {
    assert.ok(genericGateway.expected.fields.confidenceScore.maximum <= 0.6);
    assert.ok(genericGateway.expected.fields.confidenceScore.rationale.length > 0);
    assert.equal(
      genericGateway.expected.fields.confidenceScore.basis,
      "policy_heuristic"
    );
  }
});
