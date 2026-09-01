import type { Model } from "@nozbe/watermelondb";
import type { FinancialActionEnvelopeV1, Sha256Provider } from "@monyvi/logic";

import {
  ACCOUNT_BALANCE_COMMAND_ERROR_CODES,
  createAccountBalanceCommandService,
} from "../../services/account-balance-command-service";
import { parseCanonicalUnsignedIntegerString } from "../../../../packages/logic/src/financial-actions/action-contracts";
import type {
  CommitFinancialActionGroupLocallyInput,
  FinancialActionFoundationRepository,
} from "../../services/financial-action-foundation-repository";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";

function model(
  table: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  preparedState: "create" | null = null
): Model {
  return {
    table,
    id,
    _isEditing: false,
    _preparedState: preparedState,
    _raw: { id, _status: "created", _changed: "", ...values },
  } as unknown as Model;
}

function setRaw(
  modelValue: Model,
  values: Readonly<Record<string, unknown>>
): void {
  modelValue._raw = {
    ...modelValue._raw,
    ...values,
  };
}

function envelope(): FinancialActionEnvelopeV1 {
  return {
    accountGuards: [
      {
        accountId: ACCOUNT_ID,
        expectedRevision: parseCanonicalUnsignedIntegerString("7"),
      },
    ],
    actionId: ACTION_ID,
    domain: "accounts",
    domainReferenceId: ACCOUNT_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "edit_balance",
    occurredAt: "2026-09-01T12:00:00.000Z",
    payload: {
      accountEffects: [
        { accountId: ACCOUNT_ID, amountMinorUnits: "2500", currency: "EGP" },
      ],
      domainMutation: {
        records: [
          {
            after: {
              createdAt: "2026-08-01T12:00:00.000Z",
              currency: "EGP",
              deleted: false,
              id: ACCOUNT_ID,
              institutionId: null,
              isDefault: true,
              name: "Cash",
              openingBalanceMinorUnits: null,
              providerDisplayName: null,
              targetBalanceMinorUnits: "12500",
              type: "CASH",
            },
            entity: "account",
            expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
            mode: "update",
          },
        ],
      },
      domainRecordRefs: [ACCOUNT_ID],
      operationCode: "account.edit-balance",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER_ID,
  };
}

const hashProvider: Sha256Provider = {
  digestUtf8: (): Promise<string> => Promise.resolve("a".repeat(64)),
};

function createHarness(): {
  readonly account: Model;
  readonly commit: jest.Mock;
  readonly service: ReturnType<typeof createAccountBalanceCommandService>;
} {
  const account = model("accounts", ACCOUNT_ID, {
    balance: 100,
    currency: "EGP",
    financial_revision: "7",
    user_id: USER_ID,
  });
  const commit = jest.fn(
    async (input: CommitFinancialActionGroupLocallyInput) => {
      const plan = await input.prepareLinkedOperationPlan();
      const accountOperation = plan.existingOperations.find(
        (operation) => operation.model.table === "accounts"
      );
      if (!accountOperation || accountOperation.kind !== "update") {
        throw new Error("missing account operation");
      }
      accountOperation.update(accountOperation.model);
      expect(
        plan.preparedCreates.filter(
          (candidate) => candidate.table === "account_financial_effects"
        )
      ).toHaveLength(1);
      return {
        kind: "committed" as const,
        record: model(
          "financial_action_groups",
          ACTION_ID,
          {}
        ) as unknown as never,
      };
    }
  );
  const foundationRepository = {
    commitFinancialActionGroupLocally: commit,
  } as unknown as FinancialActionFoundationRepository;
  const service = createAccountBalanceCommandService({
    foundationRepository,
    prepareEffectCreate: (input) =>
      model(
        "account_financial_effects",
        "40000000-0000-4000-8000-000000000004",
        {
          accepted_account_revision: input.acceptedAccountRevision,
          account_id: input.accountId,
          action_id: input.actionId,
          amount_minor_units: input.amountMinorUnits,
          currency: input.currency,
          domain: input.domain,
          kind: input.kind,
          user_id: input.userId,
        },
        "create"
      ),
  });
  return { account, commit, service };
}

describe("account balance command service", () => {
  it("commits the domain row, exact account delta, revision, effect, and root as one plan", async () => {
    const harness = createHarness();
    await expect(
      harness.service.execute({
        envelope: envelope(),
        hashProvider,
        prepareDomainOperationPlan: () =>
          Promise.resolve({
            preparedCreates: [],
            existingOperations: [
              {
                kind: "update",
                model: harness.account,
                update: (candidate): void => {
                  setRaw(candidate, { balance: 125, financial_revision: "8" });
                },
              },
            ],
            assertCachedOwnership: (): Promise<void> => Promise.resolve(),
            assertPreparedOwnership: (): Promise<void> => Promise.resolve(),
          }),
      })
    ).resolves.toMatchObject({ kind: "committed" });
    expect(harness.commit).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a writer prepares a different balance delta", async () => {
    const harness = createHarness();
    await expect(
      harness.service.execute({
        envelope: envelope(),
        hashProvider,
        prepareDomainOperationPlan: () =>
          Promise.resolve({
            preparedCreates: [],
            existingOperations: [
              {
                kind: "update",
                model: harness.account,
                update: (candidate): void => {
                  setRaw(candidate, { balance: 124, financial_revision: "8" });
                },
              },
            ],
            assertCachedOwnership: (): Promise<void> => Promise.resolve(),
            assertPreparedOwnership: (): Promise<void> => Promise.resolve(),
          }),
      })
    ).rejects.toThrow(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
  });

  it("fails closed when the local account revision no longer matches its guard", async () => {
    const harness = createHarness();
    setRaw(harness.account, { financial_revision: "8" });
    await expect(
      harness.service.execute({
        envelope: envelope(),
        hashProvider,
        prepareDomainOperationPlan: () =>
          Promise.resolve({
            preparedCreates: [],
            existingOperations: [
              {
                kind: "update",
                model: harness.account,
                update: (candidate): void => {
                  setRaw(candidate, { balance: 125, financial_revision: "9" });
                },
              },
            ],
            assertCachedOwnership: (): Promise<void> => Promise.resolve(),
            assertPreparedOwnership: (): Promise<void> => Promise.resolve(),
          }),
      })
    ).rejects.toThrow(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.REVISION_STALE);
  });
});
