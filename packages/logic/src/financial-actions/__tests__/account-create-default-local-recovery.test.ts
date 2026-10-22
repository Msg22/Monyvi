/**
 * #395 T069 pure unit tests for Add-only private local recovery snapshot schema & parser.
 * Tests authored first per tests-first methodology; not executed directly in this lane.
 */
import {
  ACCOUNT_PHYSICAL_COLUMNS,
  accountCreateDefaultLocalRecoverySnapshotSchema,
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  inspectAccountCreateDefaultLocalRecoverySnapshot,
  serializeAccountCreateDefaultLocalRecoverySnapshotJson,
  type AccountCreateDefaultLocalRecoverySnapshot,
  type ExpectedOwnedAddRoot,
} from "../account-create-default-local-recovery";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const ACTION_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const PREDECESSOR_ID = "44444444-4444-4444-8444-444444444444";
const PRIOR_DEFAULT_ID = "55555555-5555-4555-8555-555555555555";
const BANK_DETAIL_ID = "66666666-6666-4666-8666-666666666666";
const SENDER_ID = "77777777-7777-4777-8777-777777777777";
const EFFECT_ID = "88888888-8888-4888-8888-888888888888";

function baseSnapshot(): AccountCreateDefaultLocalRecoverySnapshot {
  return {
    version: "account-create-default-local-save/v1",
    actionId: ACTION_ID,
    ownerId: OWNER_ID,
    rootBinding: {
      domain: "accounts",
      kind: "create_with_default",
      domainReferenceId: ACCOUNT_ID,
      payloadVersion: "account.create-default/v1",
    },
    payloadHash: HASH_A,
    expectedDefaultSnapshot: {
      activeAccountIds: [],
      defaultAccount: null,
    },
    preparedDefaultSnapshot: {
      activeAccountIds: [ACCOUNT_ID],
      defaultAccount: { accountId: ACCOUNT_ID, isDefault: true },
    },
    dependencyRoots: [],
    createdAccount: {
      accountId: ACCOUNT_ID,
      preimage: null,
      postimage: {
        userId: OWNER_ID,
        currency: "EGP",
        balanceMinorUnits: "0",
        financialRevision: "0",
        isDefault: true,
        deleted: false,
      },
      expectedPostimageHash: HASH_B,
    },
    createdChildren: [],
    openingEffect: null,
    priorDefault: null,
  };
}

describe("#395 AccountCreateDefaultLocalRecoverySnapshot pure tests", () => {
  it("parses minimal valid zero-opening Add snapshot without children or prior default", () => {
    const valid = baseSnapshot();
    const parsed = accountCreateDefaultLocalRecoverySnapshotSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it("parses valid snapshot with nonzero opening effect and matching revision 1", () => {
    const valid: AccountCreateDefaultLocalRecoverySnapshot = {
      ...baseSnapshot(),
      createdAccount: {
        accountId: ACCOUNT_ID,
        preimage: null,
        postimage: {
          userId: OWNER_ID,
          currency: "EGP",
          balanceMinorUnits: "1001",
          financialRevision: "1",
          isDefault: true,
          deleted: false,
        },
        expectedPostimageHash: HASH_B,
      },
      openingEffect: {
        effectId: EFFECT_ID,
        accountId: ACCOUNT_ID,
        userId: OWNER_ID,
        actionId: ACTION_ID,
        preimage: null,
        postimage: {
          amountMinorUnits: "1001",
          currency: "EGP",
          acceptedAccountRevision: "1",
          domain: "accounts",
          kind: "account.create-default",
          isEffective: true,
          deleted: false,
          compensatedAt: null,
          reversesEffectId: null,
        },
        expectedPostimageHash: HASH_C,
      },
    };
    const parsed = accountCreateDefaultLocalRecoverySnapshotSchema.parse(valid);
    expect(parsed.openingEffect).not.toBeNull();
    expect(parsed.createdAccount.postimage.financialRevision).toBe("1");
  });

  it("parses valid snapshot with sorted bank_details and account_sms_sender children", () => {
    const valid: AccountCreateDefaultLocalRecoverySnapshot = {
      ...baseSnapshot(),
      createdChildren: [
        {
          entity: "account_sms_sender",
          id: SENDER_ID,
          accountId: ACCOUNT_ID,
          preimage: null,
          expectedPostimageHash: HASH_B,
        },
        {
          entity: "bank_details",
          id: BANK_DETAIL_ID,
          accountId: ACCOUNT_ID,
          preimage: null,
          expectedPostimageHash: HASH_C,
        },
      ],
    };
    const parsed = accountCreateDefaultLocalRecoverySnapshotSchema.parse(valid);
    expect(parsed.createdChildren).toHaveLength(2);
  });

  it("parses valid snapshot with cleared prior default and transport pre/post images", () => {
    const valid: AccountCreateDefaultLocalRecoverySnapshot = {
      ...baseSnapshot(),
      expectedDefaultSnapshot: {
        activeAccountIds: [PRIOR_DEFAULT_ID],
        defaultAccount: { accountId: PRIOR_DEFAULT_ID, isDefault: true },
      },
      preparedDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_ID, PRIOR_DEFAULT_ID].sort(),
        defaultAccount: { accountId: ACCOUNT_ID, isDefault: true },
      },
      priorDefault: {
        accountId: PRIOR_DEFAULT_ID,
        userId: OWNER_ID,
        preimage: {
          currency: "EGP",
          balanceMinorUnits: "10000",
          financialRevision: "5",
          isDefault: true,
          deleted: false,
        },
        postimage: {
          currency: "EGP",
          balanceMinorUnits: "10000",
          financialRevision: "5",
          isDefault: false,
          deleted: false,
        },
        preimageHash: HASH_A,
        expectedPostimageHash: HASH_B,
        transportPreimage: {
          status: "synced",
          changedColumns: [],
        },
        transportPostimage: {
          status: "updated",
          changedColumns: ["is_default"],
        },
      },
    };
    const parsed = accountCreateDefaultLocalRecoverySnapshotSchema.parse(valid);
    expect(parsed.priorDefault).not.toBeNull();
    expect(parsed.priorDefault?.postimage.isDefault).toBe(false);
  });

  it("parses valid snapshot with ASCII-sorted dependency roots", () => {
    const valid: AccountCreateDefaultLocalRecoverySnapshot = {
      ...baseSnapshot(),
      dependencyRoots: [
        {
          actionId: PREDECESSOR_ID,
          payloadHash: HASH_B,
        },
      ],
    };
    const parsed = accountCreateDefaultLocalRecoverySnapshotSchema.parse(valid);
    expect(parsed.dependencyRoots).toHaveLength(1);
  });

  it("rejects unsorted or self dependency roots", () => {
    const selfDep = {
      ...baseSnapshot(),
      dependencyRoots: [{ actionId: ACTION_ID, payloadHash: HASH_B }],
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(selfDep)
    ).toThrow();
  });

  it("rejects unsorted children", () => {
    const unsorted = {
      ...baseSnapshot(),
      createdChildren: [
        {
          entity: "bank_details" as const,
          id: BANK_DETAIL_ID,
          accountId: ACCOUNT_ID,
          preimage: null,
          expectedPostimageHash: HASH_C,
        },
        {
          entity: "account_sms_sender" as const,
          id: SENDER_ID,
          accountId: ACCOUNT_ID,
          preimage: null,
          expectedPostimageHash: HASH_B,
        },
      ],
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(unsorted)
    ).toThrow();
  });

  it("rejects mismatched rootBinding domainReferenceId vs createdAccount accountId", () => {
    const mismatched = {
      ...baseSnapshot(),
      rootBinding: {
        domain: "accounts" as const,
        kind: "create_with_default" as const,
        domainReferenceId: PREDECESSOR_ID,
        payloadVersion: "account.create-default/v1" as const,
      },
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(mismatched)
    ).toThrow();
  });

  it("parseAccountCreateDefaultLocalRecoverySnapshotJson validates canonical JSON and matches 5-key expected root", () => {
    const valid = baseSnapshot();
    const json = serializeAccountCreateDefaultLocalRecoverySnapshotJson(valid);
    const parsed = parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json,
      expectedRoot: {
        actionId: ACTION_ID,
        ownerId: OWNER_ID,
        domainReferenceId: ACCOUNT_ID,
        payloadHash: HASH_A,
        expectedDefaultSnapshot: valid.expectedDefaultSnapshot,
      },
    });
    expect(parsed.actionId).toBe(ACTION_ID);
  });

  it("parseAccountCreateDefaultLocalRecoverySnapshotJson rejects non-canonical JSON with whitespace", () => {
    const valid = baseSnapshot();
    const prettyJson = JSON.stringify(valid, null, 2);
    expect(() =>
      parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json: prettyJson,
        expectedRoot: {
          actionId: ACTION_ID,
          ownerId: OWNER_ID,
          domainReferenceId: ACCOUNT_ID,
          payloadHash: HASH_A,
          expectedDefaultSnapshot: valid.expectedDefaultSnapshot,
        },
      })
    ).toThrow();
  });

  it("parseAccountCreateDefaultLocalRecoverySnapshotJson throws on root mismatch", () => {
    const valid = baseSnapshot();
    const json = serializeAccountCreateDefaultLocalRecoverySnapshotJson(valid);
    expect(() =>
      parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json,
        expectedRoot: {
          actionId: PREDECESSOR_ID,
          ownerId: OWNER_ID,
          domainReferenceId: ACCOUNT_ID,
          payloadHash: HASH_A,
          expectedDefaultSnapshot: valid.expectedDefaultSnapshot,
        },
      })
    ).toThrow();
  });

  it("parseAccountCreateDefaultLocalRecoverySnapshotJson throws on payloadHash mismatch", () => {
    const valid = baseSnapshot();
    const json = serializeAccountCreateDefaultLocalRecoverySnapshotJson(valid);
    expect(() =>
      parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json,
        expectedRoot: {
          actionId: ACTION_ID,
          ownerId: OWNER_ID,
          domainReferenceId: ACCOUNT_ID,
          payloadHash: HASH_B,
          expectedDefaultSnapshot: valid.expectedDefaultSnapshot,
        },
      })
    ).toThrow();
  });

  it("parseAccountCreateDefaultLocalRecoverySnapshotJson throws on expectedDefaultSnapshot mismatch", () => {
    const valid = baseSnapshot();
    const json = serializeAccountCreateDefaultLocalRecoverySnapshotJson(valid);
    expect(() =>
      parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json,
        expectedRoot: {
          actionId: ACTION_ID,
          ownerId: OWNER_ID,
          domainReferenceId: ACCOUNT_ID,
          payloadHash: HASH_A,
          expectedDefaultSnapshot: {
            activeAccountIds: [PREDECESSOR_ID],
            defaultAccount: { accountId: PREDECESSOR_ID, isDefault: true },
          },
        },
      })
    ).toThrow();
  });

  it("rejects invalid transport column not in ACCOUNT_PHYSICAL_COLUMNS", () => {
    const invalidCol = {
      ...baseSnapshot(),
      expectedDefaultSnapshot: {
        activeAccountIds: [PRIOR_DEFAULT_ID],
        defaultAccount: { accountId: PRIOR_DEFAULT_ID, isDefault: true },
      },
      preparedDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_ID, PRIOR_DEFAULT_ID].sort(),
        defaultAccount: { accountId: ACCOUNT_ID, isDefault: true },
      },
      priorDefault: {
        accountId: PRIOR_DEFAULT_ID,
        userId: OWNER_ID,
        preimage: {
          currency: "EGP" as const,
          balanceMinorUnits: "10000",
          financialRevision: "5",
          isDefault: true as const,
          deleted: false as const,
        },
        postimage: {
          currency: "EGP" as const,
          balanceMinorUnits: "10000",
          financialRevision: "5",
          isDefault: false as const,
          deleted: false as const,
        },
        preimageHash: HASH_A,
        expectedPostimageHash: HASH_B,
        transportPreimage: {
          status: "synced" as const,
          changedColumns: [],
        },
        transportPostimage: {
          status: "updated" as const,
          changedColumns: ["invented_column"],
        },
      },
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(invalidCol)
    ).toThrow();
  });

  it("rejects created account present in expected activeAccountIds", () => {
    const presentInExpected = {
      ...baseSnapshot(),
      expectedDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_ID],
        defaultAccount: null,
      },
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(presentInExpected)
    ).toThrow();
  });

  it("rejects member ID collision between child and created account", () => {
    const collision = {
      ...baseSnapshot(),
      createdChildren: [
        {
          entity: "bank_details" as const,
          id: ACCOUNT_ID,
          accountId: ACCOUNT_ID,
          preimage: null,
          expectedPostimageHash: HASH_C,
        },
      ],
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(collision)
    ).toThrow();
  });
  it("requires an authoritative five-field owner/root/graph binding, not a string or unbound structural parse", () => {
    const valid = baseSnapshot();
    const json = serializeAccountCreateDefaultLocalRecoverySnapshotJson(valid);
    const expectedRoot: ExpectedOwnedAddRoot = {
      actionId: ACTION_ID,
      ownerId: OWNER_ID,
      domainReferenceId: ACCOUNT_ID,
      payloadHash: HASH_A,
      expectedDefaultSnapshot: valid.expectedDefaultSnapshot,
    };
    expect(inspectAccountCreateDefaultLocalRecoverySnapshot(valid)).toEqual(
      valid
    );
    expect(
      parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json,
        expectedRoot,
      })
    ).toEqual(valid);
    expect((): void => {
      Reflect.apply(parseAccountCreateDefaultLocalRecoverySnapshotJson, null, [
        json,
      ]);
    }).toThrow();
    expect((): void => {
      Reflect.apply(parseAccountCreateDefaultLocalRecoverySnapshotJson, null, [
        { json },
      ]);
    }).toThrow();
    for (const changed of [
      { ...expectedRoot, actionId: PREDECESSOR_ID },
      { ...expectedRoot, ownerId: PREDECESSOR_ID },
      { ...expectedRoot, domainReferenceId: PREDECESSOR_ID },
      { ...expectedRoot, payloadHash: HASH_B },
      {
        ...expectedRoot,
        expectedDefaultSnapshot: {
          activeAccountIds: [PRIOR_DEFAULT_ID],
          defaultAccount: {
            accountId: PRIOR_DEFAULT_ID,
            isDefault: true as const,
          },
        },
      },
    ]) {
      expect(() =>
        parseAccountCreateDefaultLocalRecoverySnapshotJson({
          json,
          expectedRoot: changed,
        })
      ).toThrow();
    }
  });

  it("rejects any missing actual prior clear for a new default replacing A", () => {
    const original = baseSnapshot();
    const replaced = {
      ...original,
      expectedDefaultSnapshot: {
        activeAccountIds: [PRIOR_DEFAULT_ID],
        defaultAccount: { accountId: PRIOR_DEFAULT_ID, isDefault: true },
      },
      preparedDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_ID, PRIOR_DEFAULT_ID].sort(),
        defaultAccount: { accountId: ACCOUNT_ID, isDefault: true },
      },
      priorDefault: null,
    };
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(replaced)
    ).toThrow();
  });

  it("rejects nondefault creation clearing an old default or selecting a different prepared default", () => {
    const old = baseSnapshot();
    const nondefault = {
      ...old,
      createdAccount: {
        ...old.createdAccount,
        postimage: {
          ...old.createdAccount.postimage,
          isDefault: false,
        },
      },
      expectedDefaultSnapshot: {
        activeAccountIds: [PRIOR_DEFAULT_ID],
        defaultAccount: { accountId: PRIOR_DEFAULT_ID, isDefault: true },
      },
      preparedDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_ID, PRIOR_DEFAULT_ID].sort(),
        defaultAccount: { accountId: PRIOR_DEFAULT_ID, isDefault: true },
      },
    };
    expect(
      accountCreateDefaultLocalRecoverySnapshotSchema.parse(nondefault)
    ).toEqual(nondefault);
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse({
        ...nondefault,
        preparedDefaultSnapshot: {
          ...nondefault.preparedDefaultSnapshot,
          defaultAccount: null,
        },
      })
    ).toThrow();
    expect(() =>
      accountCreateDefaultLocalRecoverySnapshotSchema.parse({
        ...nondefault,
        priorDefault: {
          accountId: PRIOR_DEFAULT_ID,
          userId: OWNER_ID,
          preimage: {
            currency: "EGP",
            balanceMinorUnits: "0",
            financialRevision: "0",
            isDefault: true,
            deleted: false,
          },
          postimage: {
            currency: "EGP",
            balanceMinorUnits: "0",
            financialRevision: "0",
            isDefault: false,
            deleted: false,
          },
          preimageHash: HASH_A,
          expectedPostimageHash: HASH_B,
          transportPreimage: { status: "synced", changedColumns: [] },
          transportPostimage: {
            status: "updated",
            changedColumns: ["is_default"],
          },
        },
      })
    ).toThrow();
  });

  it("fails closed on runtime-unsafe canonical JSON and includes physical timestamps in transport metadata admission", () => {
    const base = baseSnapshot();
    expect(() =>
      serializeAccountCreateDefaultLocalRecoverySnapshotJson({
        ...base,
        createdChildren: undefined,
      })
    ).toThrow();
    expect(ACCOUNT_PHYSICAL_COLUMNS.has("created_at")).toBe(true);
    expect(ACCOUNT_PHYSICAL_COLUMNS.has("updated_at")).toBe(true);
  });
});
