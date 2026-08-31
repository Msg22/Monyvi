import {
  FINANCIAL_ACTION_STATES,
  assertFinancialActionStateEvidence,
  assertFinancialActionEvidenceTransition,
  assertFinancialActionTransition,
  FinancialActionState,
  FinancialActionStateEvidence,
} from "../action-contracts";

const ALLOWED_TRANSITIONS: Readonly<
  Record<FinancialActionState, readonly FinancialActionState[]>
> = {
  pending_local: ["local_complete", "reconciliation_incomplete"],
  local_complete: ["sync_pending", "reconciliation_incomplete"],
  sync_pending: [
    "sync_failed",
    "accepted",
    "rejected_compensating",
    "reconciliation_incomplete",
  ],
  sync_failed: ["sync_pending", "reconciliation_incomplete"],
  accepted: [],
  rejected_compensating: ["reconciled", "reconciliation_incomplete"],
  reconciled: [],
  reconciliation_incomplete: ["accepted", "rejected_compensating"],
};

const EMPTY_EVIDENCE: FinancialActionStateEvidence = {
  serverOutcome: null,
  outcomeJson: null,
  rejectionCode: null,
};

describe("financial action state machine", () => {
  it("accepts exactly the frozen transition matrix", () => {
    FINANCIAL_ACTION_STATES.forEach((from) => {
      FINANCIAL_ACTION_STATES.forEach((to) => {
        if (ALLOWED_TRANSITIONS[from].includes(to)) {
          expect(() => assertFinancialActionTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertFinancialActionTransition(from, to)).toThrow(
            "financial_action_invalid_transition"
          );
        }
      });
    });
  });

  it.each<readonly [FinancialActionState, FinancialActionStateEvidence]>([
    ["pending_local", EMPTY_EVIDENCE],
    ["local_complete", EMPTY_EVIDENCE],
    ["sync_pending", EMPTY_EVIDENCE],
    [
      "sync_failed",
      {
        serverOutcome: null,
        outcomeJson: null,
        rejectionCode: "network_retry",
      },
    ],
    [
      "accepted",
      { serverOutcome: "accepted", outcomeJson: "{}", rejectionCode: null },
    ],
    [
      "accepted",
      { serverOutcome: "idempotent", outcomeJson: "{}", rejectionCode: null },
    ],
    [
      "rejected_compensating",
      {
        serverOutcome: "stale",
        outcomeJson: "{}",
        rejectionCode: "stale_revision",
      },
    ],
    [
      "reconciled",
      {
        serverOutcome: "rejected",
        outcomeJson: "{}",
        rejectionCode: "rejected_action",
      },
    ],
    [
      "reconciliation_incomplete",
      {
        serverOutcome: null,
        outcomeJson: null,
        rejectionCode: "missing_evidence",
      },
    ],
    [
      "reconciliation_incomplete",
      {
        serverOutcome: "accepted",
        outcomeJson: "{}",
        rejectionCode: "local_apply_failed",
      },
    ],
  ])("accepts valid %s evidence", (state, evidence) => {
    expect(() =>
      assertFinancialActionStateEvidence(state, evidence)
    ).not.toThrow();
  });

  it.each<readonly [FinancialActionState, FinancialActionStateEvidence]>([
    [
      "pending_local",
      { serverOutcome: null, outcomeJson: null, rejectionCode: "unexpected" },
    ],
    [
      "sync_failed",
      { serverOutcome: null, outcomeJson: null, rejectionCode: null },
    ],
    [
      "accepted",
      { serverOutcome: "stale", outcomeJson: "{}", rejectionCode: null },
    ],
    [
      "accepted",
      { serverOutcome: "accepted", outcomeJson: null, rejectionCode: null },
    ],
    [
      "accepted",
      { serverOutcome: "accepted", outcomeJson: "{}", rejectionCode: "bad" },
    ],
    [
      "rejected_compensating",
      { serverOutcome: "stale", outcomeJson: "{}", rejectionCode: null },
    ],
    [
      "reconciled",
      { serverOutcome: "accepted", outcomeJson: "{}", rejectionCode: "bad" },
    ],
    [
      "reconciliation_incomplete",
      { serverOutcome: null, outcomeJson: "{}", rejectionCode: "bad_pair" },
    ],
    [
      "reconciliation_incomplete",
      {
        serverOutcome: "rejected",
        outcomeJson: null,
        rejectionCode: "bad_pair",
      },
    ],
    [
      "reconciliation_incomplete",
      {
        serverOutcome:
          "unknown" as FinancialActionStateEvidence["serverOutcome"],
        outcomeJson: "{}",
        rejectionCode: "unknown_outcome",
      },
    ],
    [
      "accepted",
      {
        serverOutcome: "accepted",
        outcomeJson: '{"b":true,"a":true}',
        rejectionCode: null,
      },
    ],
  ])("rejects invalid %s evidence", (state, evidence) => {
    expect(() => assertFinancialActionStateEvidence(state, evidence)).toThrow(
      "financial_action_invalid_state_evidence"
    );
  });

  it.each(["accepted", "idempotent"] as const)(
    "allows reconciliation to clear rejection for byte-identical %s evidence",
    (serverOutcome) => {
      expect(() =>
        assertFinancialActionEvidenceTransition(
          "reconciliation_incomplete",
          {
            serverOutcome,
            outcomeJson: '{"receipt":"same"}',
            rejectionCode: "local_apply_failed",
          },
          "accepted",
          {
            serverOutcome,
            outcomeJson: '{"receipt":"same"}',
            rejectionCode: null,
          }
        )
      ).not.toThrow();
    }
  );

  it.each([
    ["changed outcome", "accepted", '{"receipt":"changed"}'],
    ["changed server outcome", "idempotent", '{"receipt":"same"}'],
  ] as const)(
    "rejects reconciliation accepted evidence: %s",
    (_name, outcome, json) => {
      expect(() =>
        assertFinancialActionEvidenceTransition(
          "reconciliation_incomplete",
          {
            serverOutcome: "accepted",
            outcomeJson: '{"receipt":"same"}',
            rejectionCode: "local_apply_failed",
          },
          "accepted",
          { serverOutcome: outcome, outcomeJson: json, rejectionCode: null }
        )
      ).toThrow("financial_action_immutable_outcome_evidence");
    }
  );

  it("rejects terminal evidence mutation during rejected reconciliation", () => {
    expect(() =>
      assertFinancialActionEvidenceTransition(
        "rejected_compensating",
        {
          serverOutcome: "rejected",
          outcomeJson: '{"receipt":"same"}',
          rejectionCode: "rejected_action",
        },
        "reconciled",
        {
          serverOutcome: "rejected",
          outcomeJson: '{"receipt":"changed"}',
          rejectionCode: "rejected_action",
        }
      )
    ).toThrow("financial_action_immutable_outcome_evidence");
  });

  it.each(["stale", "rejected"] as const)(
    "allows unknown reconciliation outcome to become %s rejected compensation evidence",
    (serverOutcome) => {
      const previousEvidence: FinancialActionStateEvidence = {
        serverOutcome: null,
        outcomeJson: null,
        rejectionCode: "authoritative_outcome_pending",
      };
      const nextEvidence: FinancialActionStateEvidence = {
        serverOutcome,
        outcomeJson: '{"receipt":"rejected"}',
        rejectionCode: "stale_or_rejected_action",
      };

      expect(() =>
        assertFinancialActionTransition(
          "reconciliation_incomplete",
          "rejected_compensating"
        )
      ).not.toThrow();
      expect(() =>
        assertFinancialActionEvidenceTransition(
          "reconciliation_incomplete",
          previousEvidence,
          "rejected_compensating",
          nextEvidence
        )
      ).not.toThrow();
      expect(() =>
        assertFinancialActionStateEvidence(
          "rejected_compensating",
          nextEvidence
        )
      ).not.toThrow();
    }
  );

  it("allows rejected compensation to reconcile with byte-identical evidence", () => {
    const evidence: FinancialActionStateEvidence = {
      serverOutcome: "rejected",
      outcomeJson: '{"receipt":"same"}',
      rejectionCode: "rejected_action",
    };

    expect(() =>
      assertFinancialActionTransition("rejected_compensating", "reconciled")
    ).not.toThrow();
    expect(() =>
      assertFinancialActionEvidenceTransition(
        "rejected_compensating",
        evidence,
        "reconciled",
        evidence
      )
    ).not.toThrow();
    expect(() =>
      assertFinancialActionStateEvidence("reconciled", evidence)
    ).not.toThrow();
  });
});
