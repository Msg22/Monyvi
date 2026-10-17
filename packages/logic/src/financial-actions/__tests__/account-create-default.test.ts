/**
 * #395 T064 TESTS FIRST — Add default intent, strict tuple and zero-effect rules.
 * The inactive account-create-default module is source-authored at this
 * immutable T067 layer; the runtime registry/writer remains unmodified.
 * No test result or runtime Green is claimed by this remote source author.
 */
import { accountDefaultSnapshotSchema } from "../review-batch-save-shapes";
import {
  ACCOUNT_CREATE_DEFAULT_TUPLE,
  accountCreateDefaultPayloadSchema,
  validateAccountCreateDefaultPayload,
} from "../account-create-default";
import { canonicalizeFinancialActionEnvelope } from "../action-contracts";
import { DEFAULT_FINANCIAL_ACTION_REGISTRY } from "../action-registry";
import { legacyEditBalanceEnvelope } from "./review-batch-save-fixtures";
import {
  ADD_DEFAULT_IDS,
  firstAccountPayload,
  makeAccountCreateDefaultPayload,
  omitRootKey,
} from "./account-create-default-test-fixtures";

const ROOT_KEYS = [
  "accountEffects",
  "createGuards",
  "defaultIntent",
  "domainMutation",
  "domainRecordRefs",
  "expectedDefaultSnapshot",
  "operationCode",
  "schemaVersion",
];

/** Structural mutations deliberately cross an unknown-input validation boundary. */
function withRecords(
  records: readonly unknown[],
  original: ReturnType<
    typeof makeAccountCreateDefaultPayload
  > = makeAccountCreateDefaultPayload()
): Record<string, unknown> {
  return {
    ...original,
    domainMutation: { records },
  };
}

describe("#395 T064 account.create-default/v1 closed financial contract", () => {
  it("accepts only the frozen eight root keys and exact new operation names", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    expect(Object.keys(payload).sort()).toEqual(ROOT_KEYS);
    expect(payload).toMatchObject({
      schemaVersion: "account.create-default/v1",
      operationCode: "account.create-default",
      defaultIntent: true,
    });
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
    expect(accountCreateDefaultPayloadSchema.parse(payload)).toEqual(payload);
  });

  it.each(ROOT_KEYS)(
    "refuses omitted required root key %s rather than supplying a silent default",
    (key): void => {
      const payload = makeAccountCreateDefaultPayload();
      expect(
        accountCreateDefaultPayloadSchema.safeParse(omitRootKey(payload, key))
          .success
      ).toBe(false);
    }
  );

  it("rejects unknown root/nested keys, swapped old versions and different operation codes", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        phantom: "provider input",
      }).success
    ).toBe(false);
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        schemaVersion: "account.balance-effects/v1",
      }).success
    ).toBe(false);
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        operationCode: "review.batch-save",
      }).success
    ).toBe(false);
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        expectedDefaultSnapshot: {
          ...payload.expectedDefaultSnapshot,
          expectedUpdatedAt: "2026-10-16T09:00:00.000Z",
        },
      }).success
    ).toBe(false);
  });

  it("accepts a closed, empty first-account snapshot without inventing a counter", (): void => {
    const payload = firstAccountPayload();
    expect(
      accountDefaultSnapshotSchema.parse(payload.expectedDefaultSnapshot)
    ).toEqual({ activeAccountIds: [], defaultAccount: null });
    expect(accountCreateDefaultPayloadSchema.parse(payload)).toEqual(payload);
    expect(payload.defaultIntent).toBe(false);
    const created = payload.domainMutation.records.filter(
      (record) => record.entity === "account"
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.after.isDefault).toBe(true);
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "account_default"
      )
    ).toBe(false);
  });

  it("requires sorted, unique active owned IDs and a default belonging to that set", (): void => {
    const base = makeAccountCreateDefaultPayload().expectedDefaultSnapshot;
    expect(
      accountDefaultSnapshotSchema.safeParse({
        activeAccountIds: [ADD_DEFAULT_IDS.previous, ADD_DEFAULT_IDS.other],
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      }).success
    ).toBe(true);
    for (const activeAccountIds of [
      [ADD_DEFAULT_IDS.previous, ADD_DEFAULT_IDS.previous],
      [ADD_DEFAULT_IDS.other, ADD_DEFAULT_IDS.previous],
    ]) {
      expect(
        accountDefaultSnapshotSchema.safeParse({
          ...base,
          activeAccountIds,
        }).success
      ).toBe(false);
    }
    expect(
      accountDefaultSnapshotSchema.safeParse({
        activeAccountIds: [ADD_DEFAULT_IDS.other],
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      }).success
    ).toBe(false);
    expect(
      accountDefaultSnapshotSchema.safeParse({
        ...base,
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: false,
        },
      }).success
    ).toBe(false);
  });

  it("refuses malformed or multiple default-state evidence, not arbitrarily selecting a winner", (): void => {
    const snapshot = makeAccountCreateDefaultPayload().expectedDefaultSnapshot;
    expect(
      accountDefaultSnapshotSchema.safeParse({
        ...snapshot,
        defaults: [
          { accountId: ADD_DEFAULT_IDS.previous, isDefault: true },
          { accountId: ADD_DEFAULT_IDS.other, isDefault: true },
        ],
      }).success
    ).toBe(false);
    expect(
      accountDefaultSnapshotSchema.safeParse({
        ...snapshot,
        activeAccountIds: [ADD_DEFAULT_IDS.previous, "foreign"],
      }).success
    ).toBe(false);
  });

  it("later OFF preserves the captured previous default and does not clear anything", (): void => {
    const payload = makeAccountCreateDefaultPayload({ defaultIntent: false });
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
    expect(
      payload.domainMutation.records.filter(
        (record) => record.entity === "account_default"
      )
    ).toEqual([]);
    const create = payload.domainMutation.records.find(
      (record) => record.entity === "account"
    );
    expect(create?.after.isDefault).toBe(false);
    expect(payload.expectedDefaultSnapshot.defaultAccount).toEqual({
      accountId: ADD_DEFAULT_IDS.previous,
      isDefault: true,
    });
  });

  it("later ON clears only the exact captured prior ID with expectedIsDefault true", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    const clears = payload.domainMutation.records.filter(
      (record) => record.entity === "account_default"
    );
    expect(clears).toEqual([
      {
        entity: "account_default",
        mode: "update",
        expectedIsDefault: true,
        after: { id: ADD_DEFAULT_IDS.previous, isDefault: false },
      },
    ]);
    expect(payload.domainRecordRefs).toContain(ADD_DEFAULT_IDS.previous);
    expect(
      payload.createGuards.some(
        (guard) => guard.id === ADD_DEFAULT_IDS.previous
      )
    ).toBe(false);
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
  });

  it("rejects wrong-clear-ID even if the forged reference list follows the wrong update", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    const wrongRecords = payload.domainMutation.records.map((record) =>
      record.entity === "account_default"
        ? { ...record, after: { id: ADD_DEFAULT_IDS.other, isDefault: false } }
        : record
    );
    const wrongRefs = wrongRecords.map((record) => record.after.id).sort();
    const forged = {
      ...withRecords(wrongRecords, payload),
      domainRecordRefs: wrongRefs,
    };
    expect(accountCreateDefaultPayloadSchema.safeParse(forged).success).toBe(
      false
    );
    expect(() => validateAccountCreateDefaultPayload(forged)).toThrow();
  });

  it("rejects clearing with false expected flag or replacing unrelated account fields", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    const mutated = payload.domainMutation.records.map((record) =>
      record.entity === "account_default"
        ? { ...record, expectedIsDefault: false }
        : record
    );
    expect(
      accountCreateDefaultPayloadSchema.safeParse(withRecords(mutated, payload))
        .success
    ).toBe(false);
    const fullReplacement = payload.domainMutation.records.map((record) =>
      record.entity === "account_default"
        ? {
            ...record,
            expectedUpdatedAt: "2026-10-16T09:00:00.000Z",
            after: { ...record.after, balance: 50, name: "overwritten" },
          }
        : record
    );
    expect(
      accountCreateDefaultPayloadSchema.safeParse(
        withRecords(fullReplacement, payload)
      ).success
    ).toBe(false);
  });

  it("refuses multiple default-clear records or an invented clear for a no-default snapshot", (): void => {
    const on = makeAccountCreateDefaultPayload();
    const clear = on.domainMutation.records.find(
      (record) => record.entity === "account_default"
    );
    if (!clear) throw new Error("Expected actual default clear fixture");
    expect(
      accountCreateDefaultPayloadSchema.safeParse(
        withRecords([...on.domainMutation.records, clear], on)
      ).success
    ).toBe(false);
    const noDefault = makeAccountCreateDefaultPayload({
      activeAccountIds: [ADD_DEFAULT_IDS.previous],
      currentDefaultId: null,
    });
    expect(validateAccountCreateDefaultPayload(noDefault)).toEqual(noDefault);
    expect(
      accountCreateDefaultPayloadSchema.safeParse(
        withRecords([...noDefault.domainMutation.records, clear], noDefault)
      ).success
    ).toBe(false);
  });

  it("ON after intentionally having no default sets new true without a clear", (): void => {
    const payload = makeAccountCreateDefaultPayload({
      activeAccountIds: [ADD_DEFAULT_IDS.previous],
      currentDefaultId: null,
      defaultIntent: true,
    });
    expect(payload.expectedDefaultSnapshot.defaultAccount).toBeNull();
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "account_default"
      )
    ).toBe(false);
    expect(
      payload.domainMutation.records.find(
        (record) => record.entity === "account"
      )?.after.isDefault
    ).toBe(true);
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
  });

  it("OFF with active accounts and no default retains intentional no-default", (): void => {
    const payload = makeAccountCreateDefaultPayload({
      activeAccountIds: [ADD_DEFAULT_IDS.previous],
      currentDefaultId: null,
      defaultIntent: false,
    });
    expect(
      payload.domainMutation.records.find(
        (record) => record.entity === "account"
      )?.after.isDefault
    ).toBe(false);
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "account_default"
      )
    ).toBe(false);
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
  });

  it("forbids first-account nondefault even when form intent is OFF", (): void => {
    const payload = firstAccountPayload();
    const records = payload.domainMutation.records.map((record) =>
      record.entity === "account"
        ? { ...record, after: { ...record.after, isDefault: false } }
        : record
    );
    expect(
      accountCreateDefaultPayloadSchema.safeParse(withRecords(records, payload))
        .success
    ).toBe(false);
  });

  it("zero opening has one account and children, with NO fake financial guard/effect/transaction", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
    expect(payload.accountEffects).toEqual([]);
    expect(
      payload.domainMutation.records.map((record) => record.entity)
    ).toEqual([
      "account",
      "account_default",
      "account_sms_sender",
      "bank_details",
    ]);
    expect(
      payload.domainMutation.records.map((record) => record.entity)
    ).not.toContain("transaction");
    expect(payload.createGuards.map((guard) => guard.entity)).toEqual([
      "account",
      "account_sms_sender",
      "bank_details",
    ]);
    expect(
      payload.domainMutation.records.find(
        (record) => record.entity === "account"
      )?.after.openingBalanceMinorUnits
    ).toBe("0");
  });

  it("nonzero 10.01 has exactly one 1001 opening effect and no adjustment transaction", (): void => {
    const payload = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    expect(validateAccountCreateDefaultPayload(payload)).toEqual(payload);
    expect(payload.accountEffects).toEqual([
      {
        accountId: ADD_DEFAULT_IDS.newAccount,
        amountMinorUnits: "1001",
        currency: "EGP",
        effectId: ADD_DEFAULT_IDS.effect,
      },
    ]);
    expect(
      payload.domainMutation.records.map((record) => record.entity)
    ).not.toContain("transaction");
    expect(
      payload.domainMutation.records.find(
        (record) => record.entity === "account"
      )?.after.openingBalanceMinorUnits
    ).toBe("1001");
  });

  it("nonzero must not omit/misstate/duplicate the effect or manufacture zero effects", (): void => {
    const nonzero = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    for (const accountEffects of [
      [],
      [{ ...nonzero.accountEffects[0], amountMinorUnits: "1000" }],
      [{ ...nonzero.accountEffects[0], currency: "USD" }],
      [...nonzero.accountEffects, ...nonzero.accountEffects],
    ]) {
      expect(
        accountCreateDefaultPayloadSchema.safeParse({
          ...nonzero,
          accountEffects,
        }).success
      ).toBe(false);
    }
    const zero = makeAccountCreateDefaultPayload();
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...zero,
        accountEffects: [
          {
            accountId: ADD_DEFAULT_IDS.newAccount,
            amountMinorUnits: "0",
            currency: "EGP",
            effectId: ADD_DEFAULT_IDS.effect,
          },
        ],
      }).success
    ).toBe(false);
  });

  it("exact child/ref/create-guard coverage rejects missing child or duplicate IDs", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    expect(payload.domainRecordRefs).toEqual(
      [...payload.domainRecordRefs].sort()
    );
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        createGuards: payload.createGuards.filter(
          (guard) => guard.entity !== "bank_details"
        ),
      }).success
    ).toBe(false);
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        domainRecordRefs: payload.domainRecordRefs.filter(
          (id) => id !== ADD_DEFAULT_IDS.sender
        ),
      }).success
    ).toBe(false);
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        createGuards: [...payload.createGuards, payload.createGuards[0]],
      }).success
    ).toBe(false);
  });

  it("rejects orphaned sender/bank children and forbidden Bank child for CASH", (): void => {
    const bank = makeAccountCreateDefaultPayload();
    const orphans = bank.domainMutation.records.map((record) =>
      record.entity === "bank_details" || record.entity === "account_sms_sender"
        ? {
            ...record,
            after: { ...record.after, accountId: ADD_DEFAULT_IDS.other },
          }
        : record
    );
    expect(
      accountCreateDefaultPayloadSchema.safeParse(withRecords(orphans, bank))
        .success
    ).toBe(false);
    const cash = firstAccountPayload();
    const bankChild = bank.domainMutation.records.find(
      (record) => record.entity === "bank_details"
    );
    if (!bankChild) throw new Error("Missing canonical Bank child");
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...cash,
        domainMutation: {
          records: [...cash.domainMutation.records, bankChild],
        },
        createGuards: [
          ...cash.createGuards,
          ...bank.createGuards.filter(
            (guard) => guard.entity === "bank_details"
          ),
        ],
        domainRecordRefs: [
          ...cash.domainRecordRefs,
          ADD_DEFAULT_IDS.bankDetails,
        ].sort(),
      }).success
    ).toBe(false);
  });

  it("rejects duplicate sender normalization, stale/inexact records, and noncanonical money", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    const sender = payload.domainMutation.records.find(
      (record) => record.entity === "account_sms_sender"
    );
    if (!sender) throw new Error("Missing canonical sender");
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...payload,
        domainMutation: {
          records: [
            ...payload.domainMutation.records,
            {
              ...sender,
              after: {
                ...sender.after,
                id: ADD_DEFAULT_IDS.other,
                senderName: " cibegypt ",
              },
            },
          ],
        },
      }).success
    ).toBe(false);
    const invalidMoney = makeAccountCreateDefaultPayload({
      openingMinorUnits: "01001",
    });
    expect(
      accountCreateDefaultPayloadSchema.safeParse(invalidMoney).success
    ).toBe(false);
    const account = payload.domainMutation.records.find(
      (record) => record.entity === "account"
    );
    if (!account) throw new Error("Missing canonical account");
    expect(
      accountCreateDefaultPayloadSchema.safeParse(
        withRecords(
          payload.domainMutation.records.map((record) =>
            record.entity === "account"
              ? { ...record, after: { ...record.after, deleted: true } }
              : record
          ),
          payload
        )
      ).success
    ).toBe(false);
  });

  it("retains the deployed account.balance-effects/v1 create and edit tuples unchanged", (): void => {
    const older = DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
      "accounts",
      "create",
      "account.balance-effects/v1"
    );
    expect(older.domain).toBe("accounts");
    expect(older.kind).toBe("create");
    const canonicalOld = canonicalizeFinancialActionEnvelope(
      legacyEditBalanceEnvelope,
      DEFAULT_FINANCIAL_ACTION_REGISTRY
    );
    expect(canonicalOld).toEqual(legacyEditBalanceEnvelope);
    expect(
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "accounts",
        "edit_balance",
        "account.balance-effects/v1"
      ).payloadVersion
    ).toBe("account.balance-effects/v1");
    expect(() =>
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "accounts",
        "create",
        "account.create-default/v1"
      )
    ).toThrow("financial_action_unknown_definition");
  });

  it("keeps the new Add tuple frozen but inactive in the deployed registry", (): void => {
    expect(ACCOUNT_CREATE_DEFAULT_TUPLE).toEqual({
      domain: "accounts",
      kind: "create_with_default",
      payloadVersion: "account.create-default/v1",
    });
    expect(() =>
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        ACCOUNT_CREATE_DEFAULT_TUPLE.domain,
        ACCOUNT_CREATE_DEFAULT_TUPLE.kind,
        ACCOUNT_CREATE_DEFAULT_TUPLE.payloadVersion
      )
    ).toThrow("financial_action_unknown_definition");
  });

  it("accepts an Add Bank detail's optional original account number without widening Review", (): void => {
    const payload = makeAccountCreateDefaultPayload();
    const records = payload.domainMutation.records.map((record) =>
      record.entity === "bank_details"
        ? { ...record, after: { ...record.after, accountNumber: "001234567" } }
        : record
    );
    const withNumber = withRecords(records, payload);
    expect(
      accountCreateDefaultPayloadSchema.safeParse(withNumber).success
    ).toBe(true);
  });

  it("forbids a Cash SMS sender child even when guards and refs match", (): void => {
    const cash = firstAccountPayload();
    const bank = makeAccountCreateDefaultPayload();
    const sender = bank.domainMutation.records.find(
      (record) => record.entity === "account_sms_sender"
    );
    if (!sender || sender.entity !== "account_sms_sender") {
      throw new Error("Missing canonical sender fixture");
    }
    const foreignChild = {
      ...sender,
      after: { ...sender.after, accountId: ADD_DEFAULT_IDS.newAccount },
    };
    expect(
      accountCreateDefaultPayloadSchema.safeParse({
        ...cash,
        domainMutation: {
          records: [...cash.domainMutation.records, foreignChild],
        },
        createGuards: [
          ...cash.createGuards,
          {
            entity: "account_sms_sender",
            id: sender.after.id,
            expectedAbsent: true,
          },
        ],
        domainRecordRefs: [...cash.domainRecordRefs, sender.after.id].sort(),
      }).success
    ).toBe(false);
  });
});
