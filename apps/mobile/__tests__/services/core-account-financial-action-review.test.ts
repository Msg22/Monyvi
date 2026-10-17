/**
 * #395 T047 — tests first for the explicit review-only core adapter.
 * No real database, provider, registry activation or platform operations.
 * Missing createCoreReviewBatchSaveAdapter is an intentional creation Red.
 */
import {
  canonicalizeFinancialActionEnvelope,
  parseCanonicalUnsignedIntegerString,
  serializeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import {
  createFinancialActionRegistry,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  type RegisteredActionPayload,
} from "../../../../packages/logic/src/financial-actions/action-registry";
import {
  createReviewFinancialActionDefinitions,
  validateReviewBatchSavePayload,
} from "../../../../packages/logic/src/financial-actions/review-batch-save";
import {
  BANK,
  CASH,
  CASH_EGP,
  CASH_USD,
  WALLET,
  creationEnvelope,
  makeVoiceCreationPayload,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-creation-default-fixtures";
import {
  ungroupedAtmCashDestinationPayload,
  validVoiceCashPayload,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-regression-fixtures";
import {
  ATM_CASH_ACCOUNT_ID,
  ATM_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_ACTION_ID,
  REVIEW_INCOME_RECORD_ID,
  atmTransferEnvelope,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  smsNewBankEnvelope,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import type {
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
} from "../../services/financial-action-foundation-contracts";
import type {
  AccountBalanceCommandService,
  ExecuteAccountBalanceCommandInput,
} from "../../services/account-balance-command-service";
import { createCoreReviewBatchSaveAdapter } from "../../services/core-account-financial-action-service";

const BOUNDARY_STOP = "t047_review_command_boundary_only";
const UNSUPPORTED_REVIEW_PAYLOAD = "t047_invalid_review_payload";
const REVIEW_REGISTRY = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(UNSUPPORTED_REVIEW_PAYLOAD),
]);

interface ReviewHarness {
  readonly execute: AccountBalanceCommandService["execute"];
  readonly captured: ExecuteAccountBalanceCommandInput[];
  readonly commandExecutor: jest.MockedFunction<
    AccountBalanceCommandService["execute"]
  >;
}

function planBoundary(): FinancialActionLinkedOperationPlan {
  return {
    preparedCreates: [],
    existingOperations: [],
    assertCachedOwnership: (): Promise<void> => Promise.resolve(),
    assertPreparedOwnership: (): Promise<void> => Promise.resolve(),
  };
}

function commandInput(
  envelope: FinancialActionEnvelopeV1
): ExecuteAccountBalanceCommandInput {
  return {
    envelope,
    hashProvider: {
      digestUtf8: (): Promise<string> => Promise.resolve("a".repeat(64)),
    },
    prepareDomainOperationPlan:
      (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve(planBoundary()),
  };
}

/** Only the downstream typed command executor is replaced; never the adapter. */
function harness(): ReviewHarness {
  const captured: ExecuteAccountBalanceCommandInput[] = [];
  const commandExecutor = jest.fn(
    (
      command: ExecuteAccountBalanceCommandInput
    ): Promise<CommitFinancialActionGroupLocallyResult> => {
      captured.push(command);
      return Promise.reject(new Error(BOUNDARY_STOP));
    }
  );
  const adapter = createCoreReviewBatchSaveAdapter({
    executeReviewCommand: commandExecutor,
  });
  return { execute: adapter.execute, captured, commandExecutor };
}

function acceptedEnvelope(
  envelope: FinancialActionEnvelopeV1
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(envelope, REVIEW_REGISTRY);
}

function withPayload(
  envelope: FinancialActionEnvelopeV1,
  payload: RegisteredActionPayload
): FinancialActionEnvelopeV1 {
  return { ...envelope, payload };
}

async function capturedReview(
  envelope: FinancialActionEnvelopeV1
): Promise<ExecuteAccountBalanceCommandInput> {
  const expected = acceptedEnvelope(envelope);
  const subject = harness();
  await expect(subject.execute(commandInput(envelope))).rejects.toThrow(
    BOUNDARY_STOP
  );
  expect(subject.commandExecutor).toHaveBeenCalledTimes(1);
  const result = subject.captured[0];
  if (!result) throw new Error("t047_missing_review_command");
  expect(result.envelope).toEqual(expected);
  return result;
}

async function rejectedBeforeCommand(
  envelope: FinancialActionEnvelopeV1
): Promise<void> {
  const subject = harness();
  await expect(subject.execute(commandInput(envelope))).rejects.toThrow();
  expect(subject.commandExecutor).not.toHaveBeenCalled();
  expect(subject.captured).toHaveLength(0);
}

describe("#395 T047 — review-only core adapter / positive controls", () => {
  it("accepts the canonical closed review envelope through its explicit opt-in registry", () => {
    const canonical = acceptedEnvelope(reviewBatchSaveEnvelope);
    expect(canonical.payload).toEqual(reviewBatchSaveEnvelope.payload);
    expect(
      REVIEW_REGISTRY.resolve(
        "transactions",
        "review_batch_save",
        "review.batch-save/v1"
      )
    ).toBeDefined();
  });

  it("forwards an existing account's exact zero effect AND revision guard", async () => {
    const command = await capturedReview(reviewBatchSaveEnvelope);
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(command.envelope.accountGuards).toEqual([
      { accountId: REVIEW_ACCOUNT_ID, expectedRevision: "7" },
    ]);
    expect(validated.accountEffects).toEqual([
      {
        accountId: REVIEW_ACCOUNT_ID,
        amountMinorUnits: "0",
        currency: "EGP",
        effectId: reviewBatchSaveEnvelope.payload.accountEffects[0]?.effectId,
      },
    ]);
    expect(validated.domainRecordRefs).toHaveLength(2);
  });

  it("preserves one account's zero effect alongside two real financial creates", async () => {
    const payload = validVoiceCashPayload();
    const account = payload.domainMutation.records.find(
      (r) => r.entity === "account"
    );
    if (!account) throw new Error("Missing synthetic Voice Cash account");
    const envelope: FinancialActionEnvelopeV1 = {
      ...reviewBatchSaveEnvelope,
      payload,
      accountGuards: [
        {
          accountId: account.after.id,
          expectedRevision: parseCanonicalUnsignedIntegerString("0"),
        },
      ],
    };
    const command = await capturedReview(envelope);
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(validated.accountEffects).toHaveLength(1);
    expect(validated.accountEffects[0]?.amountMinorUnits).toBe("0");
    expect(command.envelope.accountGuards[0]?.expectedRevision).toBe("0");
  });

  it("retains both Voice Cash currencies and two independent new-account guards", async () => {
    const payload = makeVoiceCreationPayload([CASH_EGP, CASH_USD]);
    const command = await capturedReview(creationEnvelope(payload));
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(command.envelope.accountGuards).toEqual([
      { accountId: CASH_USD.accountId, expectedRevision: "0" },
      { accountId: CASH_EGP.accountId, expectedRevision: "0" },
    ]);
    expect(validated.accountEffects).toEqual(payload.accountEffects);
    expect(validated.creationDefaultSnapshot).toEqual({
      activeAccountIds: [],
      defaultAccount: null,
    });
  });

  it("preserves mixed Cash/Bank/Wallet creation, BANK child and frozen default", async () => {
    const payload = makeVoiceCreationPayload([CASH, WALLET, BANK]);
    const command = await capturedReview(creationEnvelope(payload));
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(validated.domainMutation).toEqual(payload.domainMutation);
    expect(
      payload.domainMutation.records.filter((r) => r.entity === "bank_details")
    ).toHaveLength(1);
    expect(
      payload.domainMutation.records.filter(
        (r) => r.entity === "account" && r.after.isDefault
      )
    ).toHaveLength(1);
    expect(
      payload.domainMutation.records.find(
        (r) => r.entity === "account" && r.after.isDefault
      )?.after.id
    ).toBe(BANK.accountId);
  });

  it("preserves existing active/no-default state without inventing default writes", async () => {
    const payload = makeVoiceCreationPayload(
      [WALLET, BANK],
      [REVIEW_ACCOUNT_ID]
    );
    const command = await capturedReview(creationEnvelope(payload));
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(validated.creationDefaultSnapshot).toEqual({
      activeAccountIds: [REVIEW_ACCOUNT_ID],
      defaultAccount: null,
    });
    expect(
      payload.domainMutation.records.filter(
        (r) => r.entity === "account" && r.after.isDefault
      )
    ).toHaveLength(0);
  });

  it("keeps SMS bank child, fingerprint and local-only cleanup descriptors", async () => {
    const command = await capturedReview(smsNewBankEnvelope);
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(validated.localSmsBookkeeping).toEqual(
      smsNewBankEnvelope.payload.localSmsBookkeeping
    );
    expect(validated.selectedSourceRefs).toEqual(
      smsNewBankEnvelope.payload.selectedSourceRefs
    );
    expect(validated.createGuards).toEqual(
      smsNewBankEnvelope.payload.createGuards
    );
  });

  it("keeps the existing eligible Cash ATM destination without creating it", async () => {
    const command = await capturedReview(atmTransferEnvelope);
    const validated = validateReviewBatchSavePayload(command.envelope.payload);
    expect(command.envelope.accountGuards.map((g) => g.accountId)).toEqual([
      ATM_BANK_ACCOUNT_ID,
      ATM_CASH_ACCOUNT_ID,
    ]);
    expect(validated.domainMutation.records).toHaveLength(1);
    expect(validated.createGuards.some((g) => g.entity === "account")).toBe(
      false
    );
  });

  it("preserves the caller's plan callback for the command's owned writer", async () => {
    const subject = harness();
    const prepareDomainOperationPlan = jest.fn(
      (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve(planBoundary())
    );
    await expect(
      subject.execute({
        ...commandInput(reviewBatchSaveEnvelope),
        prepareDomainOperationPlan,
      })
    ).rejects.toThrow(BOUNDARY_STOP);
    expect(prepareDomainOperationPlan).not.toHaveBeenCalled();
    expect(subject.captured[0]?.prepareDomainOperationPlan).toBe(
      prepareDomainOperationPlan
    );
  });

  it("keeps exact action identity and canonical bytes across separately retried calls", async () => {
    const first = (await capturedReview(reviewBatchSaveEnvelope)).envelope;
    const second = (await capturedReview(reviewBatchSaveEnvelope)).envelope;
    expect(first.actionId).toBe(REVIEW_ACTION_ID);
    expect(second).toEqual(first);
    expect(serializeFinancialActionEnvelope(first, REVIEW_REGISTRY)).toBe(
      serializeFinancialActionEnvelope(second, REVIEW_REGISTRY)
    );
  });
});

describe("#395 T047 — reject unsafe review boundaries before command dispatch", () => {
  const wrongHeaders: ReadonlyArray<{
    readonly label: string;
    readonly envelope: FinancialActionEnvelopeV1;
  }> = [
    {
      label: "wrong domain",
      envelope: { ...reviewBatchSaveEnvelope, domain: "accounts" },
    },
    {
      label: "wrong kind",
      envelope: { ...reviewBatchSaveEnvelope, kind: "batch_import" },
    },
    {
      label: "wrong payload version",
      envelope: {
        ...reviewBatchSaveEnvelope,
        payloadVersion: "account.balance-effects/v1",
      },
    },
  ];
  it.each(wrongHeaders)("rejects $label", async ({ envelope }) => {
    await rejectedBeforeCommand(envelope);
  });

  it("rejects the incorrect root even when every financial create is present", async () => {
    await rejectedBeforeCommand({
      ...reviewBatchSaveEnvelope,
      domainReferenceId: REVIEW_ACCOUNT_ID,
    });
  });

  it("rejects a zero-net account when its guard was removed", async () => {
    await rejectedBeforeCommand({
      ...reviewBatchSaveEnvelope,
      accountGuards: [],
    });
  });

  it("rejects an empty effect list instead of silently dropping zero net", async () => {
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...reviewBatchSaveEnvelope.payload,
        accountEffects: [],
      })
    );
  });

  it("rejects changed zero effect while keeping selected rows unchanged", async () => {
    const effect = reviewBatchSaveEnvelope.payload.accountEffects[0];
    if (!effect) throw new Error("Missing baseline zero effect");
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...reviewBatchSaveEnvelope.payload,
        accountEffects: [{ ...effect, amountMinorUnits: "1" }],
      })
    );
  });

  it("rejects an existing guard whose revision would overflow", async () => {
    await rejectedBeforeCommand({
      ...reviewBatchSaveEnvelope,
      accountGuards: [
        {
          accountId: REVIEW_ACCOUNT_ID,
          expectedRevision: parseCanonicalUnsignedIntegerString(
            "9223372036854775807"
          ),
        },
      ],
    });
  });

  it("rejects missing absent-create guard for a planned account", async () => {
    const envelope = creationEnvelope(makeVoiceCreationPayload([BANK]));
    const payload = validateReviewBatchSavePayload(envelope.payload);
    await rejectedBeforeCommand(
      withPayload(envelope, {
        ...payload,
        createGuards: payload.createGuards.filter(
          (g) => g.entity !== "account"
        ),
      })
    );
  });

  it("rejects a new-account financial guard with nonzero expected revision", async () => {
    const envelope = creationEnvelope(makeVoiceCreationPayload([CASH_EGP]));
    await rejectedBeforeCommand({
      ...envelope,
      accountGuards: [
        {
          accountId: CASH_EGP.accountId,
          expectedRevision: parseCanonicalUnsignedIntegerString("7"),
        },
      ],
    });
  });

  it("rejects new account without confirmed group even with exact effects", async () => {
    const envelope = creationEnvelope(makeVoiceCreationPayload([CASH_EGP]));
    const payload = validateReviewBatchSavePayload(envelope.payload);
    await rejectedBeforeCommand(
      withPayload(envelope, {
        ...payload,
        confirmedGroupRefs: [],
      })
    );
  });

  it("rejects mismatched currency on a selected account effect", async () => {
    const envelope = creationEnvelope(makeVoiceCreationPayload([CASH_EGP]));
    const payload = validateReviewBatchSavePayload(envelope.payload);
    await rejectedBeforeCommand(
      withPayload(envelope, {
        ...payload,
        accountEffects: payload.accountEffects.map((e) => ({
          ...e,
          currency: "USD",
        })),
      })
    );
  });

  it("rejects missing BANK child rather than relaxing parent/child parity", async () => {
    const envelope = creationEnvelope(makeVoiceCreationPayload([BANK]));
    const payload = validateReviewBatchSavePayload(envelope.payload);
    await rejectedBeforeCommand(
      withPayload(envelope, {
        ...payload,
        createGuards: payload.createGuards.filter(
          (g) => g.entity !== "bank_details"
        ),
        domainRecordRefs: payload.domainRecordRefs.filter(
          (id) =>
            !payload.domainMutation.records.some(
              (r) => r.entity === "bank_details" && r.after.id === id
            )
        ),
        domainMutation: {
          records: payload.domainMutation.records.filter(
            (r) => r.entity !== "bank_details"
          ),
        },
      })
    );
  });

  it("rejects an unselected extra financial create", async () => {
    const payload = validateReviewBatchSavePayload(
      reviewBatchSaveEnvelope.payload
    );
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...payload,
        selectedSourceRefs: payload.selectedSourceRefs.slice(0, 1),
      })
    );
  });

  it("rejects a duplicate effect identity for two independently guarded accounts", async () => {
    const envelope = creationEnvelope(
      makeVoiceCreationPayload([CASH_EGP, CASH_USD])
    );
    const payload = validateReviewBatchSavePayload(envelope.payload);
    const firstId = payload.accountEffects[0]?.effectId;
    if (!firstId) throw new Error("Missing first effect id");
    await rejectedBeforeCommand(
      withPayload(envelope, {
        ...payload,
        accountEffects: payload.accountEffects.map((e) => ({
          ...e,
          effectId: firstId,
        })),
      })
    );
  });

  it("rejects noncanonical negative zero instead of reinterpreting the effect", async () => {
    const effect = reviewBatchSaveEnvelope.payload.accountEffects[0];
    if (!effect) throw new Error("Missing baseline effect");
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...reviewBatchSaveEnvelope.payload,
        accountEffects: [{ ...effect, amountMinorUnits: "-0" }],
      })
    );
  });

  it("rejects a cloud mutation that leaks raw review evidence", async () => {
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...reviewBatchSaveEnvelope.payload,
        original_transcript: "synthetic prohibited field",
      })
    );
  });

  it("rejects invented ungrouped ATM Cash without mismatching its zero guard", async () => {
    const payload = ungroupedAtmCashDestinationPayload();
    expect(() => validateReviewBatchSavePayload(payload)).toThrow(
      "review_created_account_requires_confirmed_group"
    );
    await rejectedBeforeCommand({
      ...atmTransferEnvelope,
      payload,
      accountGuards: [
        atmTransferEnvelope.accountGuards[0],
        {
          accountId: ATM_CASH_ACCOUNT_ID,
          expectedRevision: parseCanonicalUnsignedIntegerString("0"),
        },
      ],
    });
  });

  it("rejects legacy v1 on the review-only entry without changing legacy APIs", async () => {
    await rejectedBeforeCommand(legacyEditBalanceEnvelope);
  });

  it("rejects future Add-default tuple on the review-only entry", async () => {
    await rejectedBeforeCommand({
      ...reviewBatchSaveEnvelope,
      payloadVersion: "account.create-default/v1",
    });
  });

  it("does not submit an unsafe operationCode or unknown review payload keys", async () => {
    await rejectedBeforeCommand(
      withPayload(reviewBatchSaveEnvelope, {
        ...reviewBatchSaveEnvelope.payload,
        operationCode: "transaction.batch-import",
        invented: true,
      })
    );
  });

  it("propagates command boundary failure without duplicating the action", async () => {
    const subject = harness();
    await expect(
      subject.execute(commandInput(reviewBatchSaveEnvelope))
    ).rejects.toThrow(BOUNDARY_STOP);
    expect(subject.commandExecutor).toHaveBeenCalledTimes(1);
    expect(subject.captured[0]?.envelope.actionId).toBe(REVIEW_ACTION_ID);
    expect(subject.captured[0]?.envelope.domainReferenceId).toBe(
      REVIEW_INCOME_RECORD_ID
    );
  });
});
