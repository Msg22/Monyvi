const mockDatabaseGet = jest.fn();
const mockDatabaseWrite = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (...args: readonly unknown[]): unknown => mockDatabaseGet(...args),
    write: (...args: readonly unknown[]): unknown => mockDatabaseWrite(...args),
  },
}));

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: (): unknown => mockGetCurrentUserDataScope(),
}));

import {
  METAL_HOLDING_ERROR_CODES,
  createMetalHolding,
} from "../../services/metal-holding-service";

describe("legacy Metal holding writer gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails closed before auth or database access until the audited action/CAS writer exists", async () => {
    await expect(
      createMetalHolding({
        name: "Gold bar",
        metalType: "GOLD",
        weightGrams: 10,
        purityFraction: 0.999,
        purchasePrice: 100000,
        purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
        currency: "EGP",
        itemForm: "BAR",
      })
    ).rejects.toThrow(METAL_HOLDING_ERROR_CODES.ACTION_WRITER_NOT_READY);

    expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
    expect(mockDatabaseGet).not.toHaveBeenCalled();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });
});
