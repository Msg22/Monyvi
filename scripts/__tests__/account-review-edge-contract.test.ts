import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { z } from "zod";

import {
  accountReviewRequestContextSchema as canonicalRequest,
  accountReviewVoiceResponseV2Schema as canonicalVoice,
  accountReviewSmsResponseV2Schema as canonicalSms,
} from "../../packages/logic/src/account-review/schemas";
import {
  makeReviewRequestContext,
  makeSmsV1Response,
  makeSmsV2Response,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_WIRE_IDS,
} from "../../packages/logic/src/account-review/__tests__/fixtures";
import {
  accountReviewRequestContextSchema as edgeRequest,
  accountReviewVoiceResponseV2Schema as edgeVoice,
  accountReviewSmsResponseV2Schema as edgeSms,
} from "../../supabase/functions/_shared/account-review-contract";

/**
 * T007: Exercise generated Edge validators and provider-facing schema behavior.
 * This is not a source-string smoke test. Functional parity must hold for valid,
 * refused, uncertain, malformed, and future/additional-key samples.
 *
 * Named schema exports are frozen in T004; production T011 must generate these
 * same entry points for the Edge copy and derive provider projections from them.
 */
function agreeOnAcceptance(
  canonical: { readonly safeParse: (value: unknown) => { readonly success: boolean } },
  edge: { readonly safeParse: (value: unknown) => { readonly success: boolean } },
  value: unknown,
  expected: boolean
): void {
  const original = canonical.safeParse(value);
  const generated = edge.safeParse(value);
  assert.equal(original.success, expected);
  assert.equal(generated.success, expected);
  assert.equal(generated.success, original.success);
}

test("the generated Edge contract is standalone and provider-relevant (not an apps/mobile import)", () => {
  const generatedSource = readFileSync(
    new URL("../../supabase/functions/_shared/account-review-contract.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(generatedSource, /from\s+["'][^"']*apps\/mobile\//);
  assert.doesNotMatch(generatedSource, /from\s+["'][^"']*packages\/logic\//);
  assert.doesNotMatch(generatedSource, /process\.env|Deno\.env|getItem\(|secretKey/i);

  // JSON Schema is the independently inspectable provider-facing projection.
  // Its fields/constraints must be derived from the same canonical validators.
  const canonicalVoiceProjection = z.toJSONSchema(canonicalVoice);
  const edgeVoiceProjection = z.toJSONSchema(edgeVoice);
  const canonicalSmsProjection = z.toJSONSchema(canonicalSms);
  const edgeSmsProjection = z.toJSONSchema(edgeSms);
  assert.deepEqual(edgeVoiceProjection, canonicalVoiceProjection);
  assert.deepEqual(edgeSmsProjection, canonicalSmsProjection);
  assert.deepEqual(z.toJSONSchema(edgeRequest), z.toJSONSchema(canonicalRequest));

  for (const serialized of [
    JSON.stringify(edgeVoiceProjection),
    JSON.stringify(edgeSmsProjection),
  ]) {
    assert.match(serialized, /transactionRef/);
    assert.match(serialized, /accountEvidence/);
    assert.match(serialized, /currencyEvidence/);
    assert.match(serialized, /suggestedAccounts/);
    assert.match(serialized, /null/);
    assert.doesNotMatch(
      serialized,
      /"balance"|"financial_revision"|"accountNumber"|"cardNumber"|"rawSmsBody"|"rawAudio"/
    );
  }
});

test("Edge and logic accept the same minimal owned provider account context", () => {
  const request = makeReviewRequestContext();
  agreeOnAcceptance(canonicalRequest, edgeRequest, request, true);
  agreeOnAcceptance(
    canonicalRequest,
    edgeRequest,
    {
      ...request,
      accounts: [{ ...request.accounts[0], balance: 1234 }],
    },
    false
  );
  agreeOnAcceptance(
    canonicalRequest,
    edgeRequest,
    {
      ...request,
      accounts: [{ ...request.accounts[0], cardLast4: "0007" }],
    },
    true
  );
  agreeOnAcceptance(
    canonicalRequest,
    edgeRequest,
    {
      ...request,
      accounts: [{ ...request.accounts[0], cardLast4: "00007" }],
    },
    false
  );
  agreeOnAcceptance(
    canonicalRequest,
    edgeRequest,
    {
      ...request,
      accounts: [
        { ...request.accounts[0], id: REVIEW_WIRE_IDS.bankAccountId },
        { ...request.accounts[0], id: REVIEW_WIRE_IDS.bankAccountId },
      ],
    },
    false
  );
});

test("Gemini Voice v2: Edge and client parity for original transcript, grounded evidence and CASH", () => {
  const response = makeVoiceV2Response();
  agreeOnAcceptance(canonicalVoice, edgeVoice, response, true);

  const cashResponse = {
    ...response,
    transactions: [{
      ...response.transactions[0],
      accountEvidence: {
        ...response.transactions[0].accountEvidence,
        type: "CASH",
      },
    }],
    suggestedAccounts: [{
      ...response.suggestedAccounts[0],
      type: "CASH",
      senderNames: [],
    }],
  };
  agreeOnAcceptance(canonicalVoice, edgeVoice, cashResponse, true);

  agreeOnAcceptance(
    canonicalVoice,
    edgeVoice,
    {
      ...response,
      transactions: [{
        ...response.transactions[0],
        accountEvidence: {
          ...response.transactions[0].accountEvidence,
          evidenceSpans: [{
            ...response.transactions[0].accountEvidence.evidenceSpans[0],
            text: "not in the transcript",
          }],
        },
      }],
    },
    false
  );
  agreeOnAcceptance(
    canonicalVoice,
    edgeVoice,
    {
      ...response,
      transactions: [{
        ...response.transactions[0],
        amount: Number.POSITIVE_INFINITY,
      }],
    },
    false
  );
  agreeOnAcceptance(canonicalVoice, edgeVoice, makeVoiceV1Response(), false);
});

test("DeepInfra SMS v2: Edge and client parity for message IDs, bidirectional suggestions and completion", () => {
  const response = makeSmsV2Response();
  agreeOnAcceptance(canonicalSms, edgeSms, response, true);
  assert.equal(response.transactions[0].messageId, REVIEW_WIRE_IDS.smsMessageId);
  assert.equal(response.completionStatus, "complete");

  for (const broken of [
    { ...response, transactions: [{ ...response.transactions[0], messageId: "" }] },
    {
      ...response,
      transactions: [{
        ...response.transactions[0],
        suggestionRef: "unreferenced-suggestion",
      }],
    },
    { ...response, suggestedAccounts: [{ ...response.suggestedAccounts[0], transactionRefs: [] }] },
    { ...response, suggestedAccounts: [response.suggestedAccounts[0], response.suggestedAccounts[0]] },
    {
      ...response,
      transactions: [{
        ...response.transactions[0],
        amount: Number.NaN,
      }],
    },
  ]) {
    agreeOnAcceptance(canonicalSms, edgeSms, broken, false);
  }
  agreeOnAcceptance(canonicalSms, edgeSms, makeSmsV1Response(), false);
});

test("uncertainty is retained in the generated provider schema; no invented omission", () => {
  const voice = makeVoiceV2Response();
  const base = {
    ...voice,
    suggestedAccounts: [],
    transactions: [{
      ...voice.transactions[0],
      suggestionRef: null,
      accountEvidence: {
        state: "absent",
        name: null,
        type: null,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [],
        candidateAccountIds: [],
      },
      currency: null,
      currencyEvidence: {
        state: "unknown",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      },
    }],
  };
  agreeOnAcceptance(canonicalVoice, edgeVoice, base, true);
  agreeOnAcceptance(
    canonicalVoice,
    edgeVoice,
    {
      ...base,
      transactions: [{
        ...base.transactions[0],
        currencyEvidence: {
          state: "omitted",
          statedCode: null,
          candidateCodes: [],
          evidenceSpans: [],
        },
      }],
    },
    true
  );
  agreeOnAcceptance(
    canonicalVoice,
    edgeVoice,
    {
      ...base,
      transactions: [{
        ...base.transactions[0],
        currencyEvidence: {
          state: "omitted",
          statedCode: "EGP",
          candidateCodes: ["EGP"],
          evidenceSpans: [],
        },
      }],
    },
    false
  );
});

test("provider contract rejects unrelated private metadata and unknown version/keys", () => {
  for (const response of [makeVoiceV2Response(), makeSmsV2Response()]) {
    const isVoice = "transcript" in response;
    const canonical = isVoice ? canonicalVoice : canonicalSms;
    const edge = isVoice ? edgeVoice : edgeSms;
    agreeOnAcceptance(canonical, edge, {
      ...response,
      reviewContractVersion: "account-review/v3",
    }, false);
    agreeOnAcceptance(canonical, edge, {
      ...response,
      rawProviderResponse: "synthetic private input",
    }, false);
  }
});
