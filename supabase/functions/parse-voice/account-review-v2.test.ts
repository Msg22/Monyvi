/**
 * #395 T012 tests-first creation Red — pure Edge v2 request/prompt/schema seam.
 * Import the future real helper directly; do not fake the SUT or invoke Gemini.
 */
import assert from "node:assert/strict";
import type { z } from "zod";
import {
  accountReviewRequestContextSchema,
  accountReviewVoiceResponseV2Schema,
} from "../_shared/account-review-contract.ts";
import {
  makeReviewRequestContext,
  makeGroundedVoiceCashV2Response,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_WIRE_IDS,
} from "./test-fixtures/account-review.ts";
import {
  parseVoiceReviewV2Context,
  buildVoiceReviewV2Instructions,
  buildVoiceReviewV2GenerationConfig,
  parseVoiceReviewV2Advisory,
} from "./account-review-v2.ts";

type ReviewContext = z.infer<typeof accountReviewRequestContextSchema>;
const VERSION: ReviewContext["reviewContractVersion"] =
  makeReviewRequestContext().reviewContractVersion;

function multipartFields(
  input: {
    readonly reviewContractVersion?: string | null;
    readonly preferredCurrency?: string | null;
    readonly accounts?: string | null;
  } = {}
): {
  readonly reviewContractVersion: string | null;
  readonly preferredCurrency: string | null;
  readonly accounts: string | null;
} {
  return {
    reviewContractVersion:
      input.reviewContractVersion === undefined
        ? VERSION
        : input.reviewContractVersion,
    preferredCurrency:
      input.preferredCurrency === undefined ? "EGP" : input.preferredCurrency,
    accounts:
      input.accounts === undefined
        ? JSON.stringify(makeReviewRequestContext().accounts)
        : input.accounts,
  };
}

Deno.test(
  "T012 v1/no opt-in does not activate a review provider schema",
  () => {
    const legacy = parseVoiceReviewV2Context(
      multipartFields({
        reviewContractVersion: null,
        preferredCurrency: null,
        accounts: JSON.stringify([
          { id: REVIEW_WIRE_IDS.bankAccountId, name: "QNB", currency: "EGP" },
        ]),
      })
    );
    assert.equal(legacy, null);
  }
);

Deno.test(
  "T012 v2 reads only canonical provider context from the original multipart fields",
  () => {
    const parsed = parseVoiceReviewV2Context(multipartFields());
    assert.deepEqual(parsed, makeReviewRequestContext());
    assert.equal(parsed?.accounts[0]?.cardLast4, "0007");
    assert.equal(parsed?.accounts[1]?.type, "CASH");
    assert.equal("ownerId" in (parsed ?? {}), false);
  }
);

Deno.test(
  "T012 opt-in rejects malformed or missing account context before provider work",
  () => {
    for (const accountJson of ["{", null, JSON.stringify([{ name: "QNB" }])]) {
      assert.throws(() =>
        parseVoiceReviewV2Context(multipartFields({ accounts: accountJson }))
      );
    }
    assert.throws(() =>
      parseVoiceReviewV2Context(multipartFields({ preferredCurrency: null }))
    );
  }
);

Deno.test(
  "T012 v2 never silently downgrades an unsupported contract version",
  () => {
    assert.throws(() =>
      parseVoiceReviewV2Context(
        multipartFields({
          reviewContractVersion: "account-review/v3",
        })
      )
    );
  }
);

Deno.test(
  "T012 private balances and default metadata are forbidden in provider input",
  () => {
    const extra = makeReviewRequestContext().accounts.map((account) => ({
      ...account,
      isDefault: true,
      openingBalanceMinorUnits: 10000,
    }));
    assert.throws(() =>
      parseVoiceReviewV2Context(
        multipartFields({ accounts: JSON.stringify(extra) })
      )
    );
  }
);

Deno.test(
  "T012 duplicate account IDs or invalid unknown currency cannot enter the model",
  () => {
    const bank = makeReviewRequestContext().accounts[0];
    if (!bank) throw new Error("Missing canonical source account");
    assert.throws(() =>
      parseVoiceReviewV2Context(
        multipartFields({ accounts: JSON.stringify([bank, bank]) })
      )
    );
    assert.throws(() =>
      parseVoiceReviewV2Context(multipartFields({ preferredCurrency: "ZZZ" }))
    );
  }
);

Deno.test(
  "T012 grounded instructions retain source/identity/currency distinctions",
  () => {
    const instruction = buildVoiceReviewV2Instructions(
      makeReviewRequestContext()
    );
    assert.ok(instruction.includes("QNB salary"));
    assert.ok(instruction.includes("Cash"));
    assert.match(instruction, /original_transcript/);
    assert.match(instruction, /evidenceSpans/);
    assert.match(instruction, /transactionRef/);
    assert.match(instruction, /currencyEvidence/);
    assert.match(instruction, /suggestedAccounts/);
    assert.match(instruction, /CASH/);
    assert.doesNotMatch(
      instruction,
      /accountNumber|cardNumber|openingBalance|isDefault|ownerId/
    );
  }
);

Deno.test(
  "T012 v2 Egyptian spoken pounds require separate exact proof, not account or preferred guess",
  () => {
    const instruction = buildVoiceReviewV2Instructions(
      makeReviewRequestContext()
    );
    for (const term of ["جنيه", "جنيهات", "جنيه مصري", "gneh", "gnih"]) {
      assert.ok(instruction.includes(term));
    }
    assert.match(instruction, /candidateCodes \["EGP"\]/);
    assert.match(instruction, /financial currency to "EGP"/);
    assert.match(instruction, /original_transcript/);
    assert.match(instruction, /UTF-16/);
    assert.match(instruction, /separate 120 and 75 rows/);
    assert.match(instruction, /first\/second occurrence/);
    assert.match(instruction, /sterling means GBP, NOT EGP/);
    assert.match(instruction, /Unqualified English pounds.*ambiguous/);
    assert.match(instruction, /conflicting or unsupported/);
    assert.match(
      instruction,
      /Never infer currency from any suggested\/matched account ID/
    );
    assert.match(
      instruction,
      /Use omitted currencyEvidence only if speech truly omitted it/
    );
  }
);

Deno.test(
  "T012 v2 uses the generated canonical Gemini schema without copying the DTO",
  () => {
    const config = buildVoiceReviewV2GenerationConfig();
    assert.equal(config.responseMimeType, "application/json");
    const serialized = JSON.stringify(config.responseJsonSchema);
    for (const field of [
      "reviewContractVersion",
      "transcript",
      "original_transcript",
      "detected_language",
      "transactions",
      "suggestedAccounts",
      "transactionRef",
      "suggestionRef",
      "accountEvidence",
      "toAccountEvidence",
      "currencyEvidence",
      "evidenceSpans",
    ]) {
      assert.ok(
        serialized.includes('"' + field + '"'),
        "Missing canonical schema field " + field
      );
    }
    assert.doesNotMatch(
      serialized,
      /openingBalanceMinorUnits|accountNumber|ownerId|isDefault/
    );
  }
);

Deno.test(
  "T012 canonical v2 Voice response retains grounded finance plus one pending suggestion",
  () => {
    const source: z.infer<typeof accountReviewVoiceResponseV2Schema> =
      makeVoiceV2Response();
    const result = parseVoiceReviewV2Advisory(source);
    assert.deepEqual(result, source);
    assert.equal(result?.transactions[0]?.amount, 50);
    assert.equal(result?.transactions[0]?.date, "2026-10-14");
    assert.equal(result?.transactions[0]?.accountEvidence.state, "explicit");
    assert.equal(result?.transactions[0]?.currencyEvidence.state, "explicit");
    assert.deepEqual(result?.suggestedAccounts[0]?.transactionRefs, [
      REVIEW_WIRE_IDS.voiceRowRef,
    ]);
  }
);

Deno.test(
  "T012 explicit grounded Voice CASH remains valid without transfer endpoints",
  () => {
    const result = parseVoiceReviewV2Advisory(
      makeGroundedVoiceCashV2Response()
    );
    assert.equal(result?.transactions[0]?.accountEvidence.type, "CASH");
    assert.equal(result?.transactions[0]?.toAccountEvidence, null);
    assert.equal(result?.suggestedAccounts[0]?.type, "CASH");
  }
);

Deno.test("T012 old-server v1 is not falsely interpreted as valid v2", () => {
  assert.equal(parseVoiceReviewV2Advisory(makeVoiceV1Response()), null);
});

Deno.test(
  "T012 malformed advisory or financial data never becomes accepted canonical v2",
  () => {
    const base = makeVoiceV2Response();
    const badAdvisory = {
      ...base,
      transactions: [
        {
          ...base.transactions[0],
          accountEvidence: {
            ...base.transactions[0]?.accountEvidence,
            evidenceSpans: [
              {
                sourceRef: "wrong-logical-request",
                field: "transcript",
                start: 0,
                end: 3,
                text: "QNB",
              },
            ],
          },
        },
      ],
    };
    assert.equal(parseVoiceReviewV2Advisory(badAdvisory), null);
    assert.equal(
      parseVoiceReviewV2Advisory({
        ...base,
        transactions: [
          { ...base.transactions[0], amount: Number.POSITIVE_INFINITY },
        ],
      }),
      null
    );
  }
);
