import type {
  FinancialActionEnvelopeV1,
  Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";

const mockUserId = "018f0c7a-1234-7abc-8def-000000000003";
const mockActionId = "018f0c7a-1234-7abc-8def-000000000001";
const mockDatabaseWrite = jest.fn();
const mockStoredRecord = {
  actionId: mockActionId,
  userId: mockUserId,
};

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({})),
    write: mockDatabaseWrite,
    batch: jest.fn(),
  },
}));

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      userId: mockUserId,
      queryOwned: jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([mockStoredRecord])),
      })),
      assertOwned: <T>(record: T): T => record,
    })
  ),
  assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
}));

import {
  createFinancialActionGroup,
  getFinancialActionGroup,
} from "../../services/financial-action-foundation-repository";

const unpublishedEnvelope: FinancialActionEnvelopeV1 = {
  actionId: mockActionId,
  userId: mockUserId,
  domain: "metals",
  kind: "sell",
  domainReferenceId: "018f0c7a-1234-7abc-8def-000000000002",
  envelopeVersion: "monyvi.financial-action/v1",
  accountGuards: [],
  occurredAt: "2026-08-31T10:15:30.123Z",
  payload: {
    feeMinorUnits: "80000",
    grossProceedsDecimal: "35500",
    holdingId: "018f0c7a-1234-7abc-8def-000000000004",
    includeAccountCredit: false,
    netProceedsMinorUnits: "3470000",
    notes: "ذهب",
    rateReferenceIds: [],
  },
  payloadVersion: "metals.sell/v1",
};

describe("production financial action registry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails closed before hashing or writing an unpublished Metals Sell action", async () => {
    const digestUtf8 = jest.fn(() => Promise.resolve("a".repeat(64)));
    const hashProvider: Sha256Provider = { digestUtf8 };

    await expect(
      createFinancialActionGroup({
        envelope: unpublishedEnvelope,
        hashProvider,
      })
    ).rejects.toThrow("financial_action_unknown_definition");

    expect(digestUtf8).not.toHaveBeenCalled();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it("keeps stored roots readable after their schema leaves the approved registry", async () => {
    await expect(getFinancialActionGroup(mockActionId)).resolves.toMatchObject({
      actionId: mockActionId,
      userId: mockUserId,
    });
  });
});
