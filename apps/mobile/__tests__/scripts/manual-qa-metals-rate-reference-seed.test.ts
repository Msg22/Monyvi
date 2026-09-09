import { createHash } from "node:crypto";

const { buildSeedIds } = jest.requireActual<{
  readonly buildSeedIds: (
    userId: string,
    seedScope: string
  ) => Record<string, any>;
}>("../../scripts/seed-fixtures/seed-engine");
const { buildManualQaExtraRows } = jest.requireActual<{
  readonly buildManualQaExtraRows: (
    context: Record<string, any>
  ) => Record<string, any>;
}>("../../scripts/seed-fixtures/manual-qa-fixture");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEED_SCOPE = "manual-qa";

function deterministicUuid(scope: string, userId: string, key: string): string {
  const hex = createHash("sha256")
    .update(`${scope}:${userId}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function dateFromToday(offset: number): string {
  const date = new Date("2026-01-15T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildRows(): Record<string, any> {
  return buildManualQaExtraRows({
    categoryIds: {
      shopping: deterministicUuid(SEED_SCOPE, USER_ID, "category:shopping"),
      income: deterministicUuid(SEED_SCOPE, USER_ID, "category:income"),
      other: deterministicUuid(SEED_SCOPE, USER_ID, "category:other"),
    },
    currentTimestamp: "2026-01-15T12:00:01.000Z",
    dateFromToday,
    deterministicUuid,
    fixedNow: "2026-01-15T12:00:00.000Z",
    seedIds: buildSeedIds(USER_ID, SEED_SCOPE),
    seedScope: SEED_SCOPE,
    userId: USER_ID,
  });
}

describe("manual QA acquisition rate-reference seed", () => {
  it("persists one metal and one purchase-currency acquisition reference per QA holding", () => {
    const rows = buildRows();
    const assets = (rows.assets as readonly Record<string, any>[]).filter(
      (asset) => asset.type === "METAL"
    );
    const references = rows.metalRateReferences as readonly Record<string, any>[];

    expect(assets).toHaveLength(5);
    expect(references).toHaveLength(10);

    for (const asset of assets) {
      const acquisitionReferences = references.filter(
        (reference) =>
          reference.holding_id === asset.id &&
          reference.action_id === asset.acquisition_action_id
      );
      expect(acquisitionReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "acquisition_metal",
            quality: "valid",
            deleted: false,
          }),
          expect.objectContaining({
            role: "acquisition_purchase_currency",
            quality: "valid",
            deleted: false,
          }),
        ])
      );
      expect(acquisitionReferences).toHaveLength(2);
    }
  });

  it("keeps seeded reference identity deterministic", () => {
    expect(buildRows().metalRateReferences).toEqual(
      buildRows().metalRateReferences
    );
  });
});
