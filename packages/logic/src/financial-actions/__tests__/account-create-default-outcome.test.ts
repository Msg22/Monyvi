/**
 * #395 T069 pure unit tests for Add-only canonicalDefaultSnapshot outcome parser.
 * Tests authored first per tests-first methodology; not executed directly in this lane.
 */
import {
  parseAccountCreateDefaultRecoveryOutcome,
  parseCanonicalDefaultSnapshot,
} from "../account-create-default-outcome";

const ACTION_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_A = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_B = "33333333-3333-4333-8333-333333333333";

describe("#395 AccountCreateDefaultOutcome pure tests", () => {
  it("parses valid stale outcome with canonicalDefaultSnapshot", () => {
    const rawOutcome = {
      actionId: ACTION_ID,
      status: "stale",
      code: "account_default_stale_default_snapshot",
      canonicalDefaultSnapshot: {
        activeAccountIds: [ACCOUNT_A, ACCOUNT_B].sort(),
        defaultAccount: { accountId: ACCOUNT_A, isDefault: true },
      },
    };
    const parsed = parseAccountCreateDefaultRecoveryOutcome({
      outcomeJson: JSON.stringify(rawOutcome),
      serverOutcome: "stale",
      expectedActionId: ACTION_ID,
    });
    expect(parsed.status).toBe("stale");
    expect(parsed.canonicalDefaultSnapshot.defaultAccount?.accountId).toBe(
      ACCOUNT_A
    );
  });

  it("parses valid rejected outcome with empty active accounts and null default", () => {
    const rawOutcome = {
      actionId: ACTION_ID,
      status: "rejected",
      code: "account_create_default_rejected",
      canonicalDefaultSnapshot: {
        activeAccountIds: [],
        defaultAccount: null,
      },
      canonicalAbsentAccountIds: [ACCOUNT_A],
    };
    const parsed = parseAccountCreateDefaultRecoveryOutcome(
      JSON.stringify(rawOutcome)
    );
    expect(parsed.status).toBe("rejected");
    expect(parsed.canonicalDefaultSnapshot.activeAccountIds).toEqual([]);
    expect(Object.keys(parsed).sort()).toEqual([
      "actionId",
      "canonicalDefaultSnapshot",
      "code",
      "status",
    ]);
  });

  it("rejects outcome with accepted status gaining canonicalDefaultSnapshot", () => {
    const rawOutcome = {
      actionId: ACTION_ID,
      status: "accepted",
      code: "ok",
      canonicalDefaultSnapshot: {
        activeAccountIds: [],
        defaultAccount: null,
      },
    };
    expect(() =>
      parseAccountCreateDefaultRecoveryOutcome(JSON.stringify(rawOutcome))
    ).toThrow();
  });

  it("rejects outcome missing canonicalDefaultSnapshot for stale/rejected status", () => {
    const rawOutcome = {
      actionId: ACTION_ID,
      status: "stale",
      code: "account_default_stale_default_snapshot",
    };
    expect(() =>
      parseAccountCreateDefaultRecoveryOutcome(JSON.stringify(rawOutcome))
    ).toThrow();
  });

  it("rejects outcome when actionId does not match expectedActionId", () => {
    const rawOutcome = {
      actionId: ACTION_ID,
      status: "rejected",
      code: "rejected_error",
      canonicalDefaultSnapshot: {
        activeAccountIds: [],
        defaultAccount: null,
      },
    };
    expect(() =>
      parseAccountCreateDefaultRecoveryOutcome({
        outcomeJson: JSON.stringify(rawOutcome),
        expectedActionId: ACCOUNT_A,
      })
    ).toThrow();
  });

  it("parseCanonicalDefaultSnapshot parses standalone 2-key default snapshot", () => {
    const snapshot = {
      activeAccountIds: [ACCOUNT_A],
      defaultAccount: { accountId: ACCOUNT_A, isDefault: true },
    };
    const parsed = parseCanonicalDefaultSnapshot(snapshot);
    expect(parsed).toEqual(snapshot);
  });
  it("projects only four Add authority fields; full receipt proof remains separate", () => {
    const parsed = parseAccountCreateDefaultRecoveryOutcome({
      outcomeJson: JSON.stringify({
        actionId: ACTION_ID,
        status: "rejected",
        code: "DOMAIN_UNIQUE_CONFLICT",
        canonicalDefaultSnapshot: {
          activeAccountIds: [ACCOUNT_A],
          defaultAccount: { accountId: ACCOUNT_A, isDefault: true },
        },
        canonicalAbsentAccountIds: [ACCOUNT_B],
        canonicalAccounts: [],
        accountRevisions: [],
        otherExternalEvidence: "never-authoritative",
      }),
      serverOutcome: "rejected",
      expectedActionId: ACTION_ID,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "actionId",
      "canonicalDefaultSnapshot",
      "code",
      "status",
    ]);
    expect("canonicalAbsentAccountIds" in parsed).toBe(false);
    expect("otherExternalEvidence" in parsed).toBe(false);
  });

  it("rejects malformed canonical graphs without accepting a guessed default", () => {
    for (const canonicalDefaultSnapshot of [
      null,
      { activeAccountIds: [ACCOUNT_B, ACCOUNT_A], defaultAccount: null },
      { activeAccountIds: [ACCOUNT_A, ACCOUNT_A], defaultAccount: null },
      {
        activeAccountIds: [ACCOUNT_A],
        defaultAccount: { accountId: ACCOUNT_B, isDefault: true },
      },
      { activeAccountIds: [], defaultAccount: null, fabricated: "extra" },
      {
        activeAccountIds: [],
        defaultAccount: { accountId: ACCOUNT_A, isDefault: false },
      },
    ]) {
      expect(() =>
        parseAccountCreateDefaultRecoveryOutcome(
          JSON.stringify({
            actionId: ACTION_ID,
            status: "stale",
            code: "REVISION_STALE",
            canonicalDefaultSnapshot,
          })
        )
      ).toThrow();
    }
  });
});
