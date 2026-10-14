import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import test, { type TestContext } from "node:test";
import { z } from "zod";

import {
  accountReviewRequestContextSchema as canonicalRequest,
  accountReviewVoiceResponseV2Schema as canonicalVoice,
  accountReviewSmsResponseV2Schema as canonicalSms,
} from "../../packages/logic/src/account-review/schemas";
import {
  makeReviewRequestContext,
  makeGroundedVoiceCashV2Response,
  makeSmsV1Response,
  makeSmsV2Response,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_WIRE_IDS,
} from "../../packages/logic/src/account-review/__tests__/fixtures";
// Do not import the not-yet-generated T011 module at collection time: the
// existing T009 generator-format regression must execute independently.
async function loadGeneratedEdge() {
  return import("../../supabase/functions/_shared/account-review-contract");
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VOCABULARY_FILE = join(
  ROOT,
  "packages/logic/src/account-review/generated-vocabulary.ts"
);

function generateVocabularyInSandbox(t: TestContext): {
  first: string;
  second: string;
  tracked: string;
} {
  const sandbox = mkdtempSync(join(tmpdir(), "monyvi-t009-vocabulary-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const sourcePaths = [
    "scripts/generate-account-review-vocabulary.cjs",
    "packages/db/src/supabase-types.ts",
    "packages/logic/src/types.ts",
  ];
  for (const relativePath of sourcePaths) {
    const copiedPath = join(sandbox, relativePath);
    mkdirSync(dirname(copiedPath), { recursive: true });
    copyFileSync(join(ROOT, relativePath), copiedPath);
  }
  const generatedPath = join(
    sandbox,
    "packages/logic/src/account-review/generated-vocabulary.ts"
  );
  mkdirSync(dirname(generatedPath), { recursive: true });
  const command = join(sandbox, sourcePaths[0]);
  const invoke = (): string =>
    execFileSync(process.execPath, [command], {
      cwd: sandbox,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  assert.match(invoke(), /from 5 vocabularies/);
  const first = readFileSync(generatedPath, "utf8");
  assert.match(invoke(), /from 5 vocabularies/);
  return {
    first,
    second: readFileSync(generatedPath, "utf8"),
    tracked: readFileSync(VOCABULARY_FILE, "utf8"),
  };
}

test("T009 five-vocabulary generator is reproducible and matches tracked canonical output", (t) => {
  const { first, second, tracked } = generateVocabularyInSandbox(t);
  assert.equal(first, second, "Two independent generator runs differ");
  assert.equal(first, tracked, "Generated vocabulary differs from the tracked source");
});

test("T009 vocabulary generator emits Prettier-hook-clean bytes, not just raw matching output", async (t) => {
  const { first } = generateVocabularyInSandbox(t);
  const config = await prettier.resolveConfig(VOCABULARY_FILE);
  const formatted = await prettier.format(first, {
    ...config,
    filepath: VOCABULARY_FILE,
  });
  assert.equal(
    first,
    formatted,
    "Generator must format before writing so regeneration stays clean after commit hooks"
  );
});


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

test("the generated Edge contract is standalone and provider-relevant (not an apps/mobile import)", async () => {
  const {
    accountReviewRequestContextSchema: edgeRequest,
    accountReviewVoiceResponseV2Schema: edgeVoice,
    accountReviewSmsResponseV2Schema: edgeSms,
  } = await loadGeneratedEdge();
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

test("Edge and logic accept the same minimal owned provider account context", async () => {
  const { accountReviewRequestContextSchema: edgeRequest } = await loadGeneratedEdge();
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

test("Gemini Voice v2: Edge and client parity for original transcript, grounded evidence and CASH", async () => {
  const { accountReviewVoiceResponseV2Schema: edgeVoice } = await loadGeneratedEdge();
  const response = makeVoiceV2Response();
  agreeOnAcceptance(canonicalVoice, edgeVoice, response, true);

  const cashResponse = makeGroundedVoiceCashV2Response();
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

test("DeepInfra SMS v2: Edge and client parity for message IDs, bidirectional suggestions and completion", async () => {
  const { accountReviewSmsResponseV2Schema: edgeSms } = await loadGeneratedEdge();
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

test("uncertainty is retained in the generated provider schema; no invented omission", async () => {
  const { accountReviewVoiceResponseV2Schema: edgeVoice } = await loadGeneratedEdge();
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

test("provider contract rejects unrelated private metadata and unknown version/keys", async () => {
  const {
    accountReviewVoiceResponseV2Schema: edgeVoice,
    accountReviewSmsResponseV2Schema: edgeSms,
  } = await loadGeneratedEdge();
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
