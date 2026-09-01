import { existsSync } from "node:fs";
import path from "node:path";

import {
  canonicalizeFinancialActionEnvelope,
  createFinancialActionRegistry,
  type RegisteredActionPayload,
} from "../../../../packages/logic/src/financial-actions";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const ACCOUNT_BALANCE_COMMAND_BOUNDARY_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/services/account-balance-command-service.ts"
);
const FINANCIAL_ACTION_SYNC_BOUNDARY_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/services/financial-action-sync-service.ts"
);
const FINANCIAL_ACTION_RECONCILIATION_BOUNDARY_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/services/financial-action-reconciliation-service.ts"
);
const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const DOMAIN_REFERENCE_ID = "018f0c7a-1234-7abc-8def-000000000002";
const ACCOUNT_ID = "018f0c7a-1234-7abc-8def-000000000007";

function validPayload(_raw: unknown): RegisteredActionPayload {
  return Object.freeze({ fixture: "transfer" });
}

const registry = createFinancialActionRegistry([
  {
    domain: "transfers",
    kind: "create",
    payloadVersion: "transfers.create/v1",
    validatePayload: validPayload,
  },
]);

function transferEnvelope(accountGuards: readonly unknown[]): unknown {
  return {
    accountGuards,
    actionId: ACTION_ID,
    domain: "transfers",
    domainReferenceId: DOMAIN_REFERENCE_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: "2026-09-01T00:00:00.000Z",
    payload: { fixture: "transfer" },
    payloadVersion: "transfers.create/v1",
    userId: USER_ID,
  };
}

describe("issue #242 guarded account action protocol", () => {
  it("keeps the frozen generic foundation guard-free until #242 installs effects", () => {
    expect(
      canonicalizeFinancialActionEnvelope(transferEnvelope([]), registry)
    ).toMatchObject({ accountGuards: [] });

    expect(() =>
      canonicalizeFinancialActionEnvelope(
        transferEnvelope([
          { accountId: ACCOUNT_ID, expectedRevision: "0" },
        ]),
        registry
      )
    ).toThrow();
  });

  it("requires one local command boundary before an action can change an account balance", () => {
    expect(existsSync(ACCOUNT_BALANCE_COMMAND_BOUNDARY_PATH)).toBe(true);
  });

  it("requires a dedicated sync boundary before account effects can leave the device", () => {
    expect(existsSync(FINANCIAL_ACTION_SYNC_BOUNDARY_PATH)).toBe(true);
  });

  it("requires a reconciliation boundary before a rejected account action can recover", () => {
    expect(existsSync(FINANCIAL_ACTION_RECONCILIATION_BOUNDARY_PATH)).toBe(
      true
    );
  });
});
