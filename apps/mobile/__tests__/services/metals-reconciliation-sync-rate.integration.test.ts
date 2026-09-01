import { createMetalRateReferenceService } from "../../services/metal-rate-reference-service";
import { applyMetalMetadataPatch } from "../../services/metal-metadata-service";

jest.mock("@monyvi/db", (): unknown => {
  const schemaModule: unknown = jest.requireActual("../../../../packages/db/src/schema");
  return schemaModule;
});
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

import {
  DEDICATED_SYNC_TABLES,
  METALS_ACTION_FRAGMENT_COLUMNS,
} from "../../services/sync/config";
import { stripMetalActionFragments } from "../../services/sync/ownership-guards";
import { runMetalPullStrategy } from "../../services/sync/pull-strategies";
import { runMetalPushStrategy } from "../../services/sync/push-service";

describe("Metals sync, rates, and metadata", () => {
  it("keeps rate references immutable and validates the role/kind matrix", () => {
    const service = createMetalRateReferenceService();
    const reference = service.capture({
      id: "rate-1",
      role: "acquisition_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "75.25",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: Date.parse("2026-08-31T10:00:00.000Z"),
      source: "fixture",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: Date.parse("2026-08-31T10:01:00.000Z"),
    });
    expect(Object.isFrozen(reference)).toBe(true);
    const invalidReference = { ...reference, role: "acquisition_purchase_currency" };
    expect(() => service.capture(invalidReference as never)).toThrow(
      "invalid_metal_rate_reference"
    );
  });

  it("applies LWW only to name and notes", () => {
    expect(
      applyMetalMetadataPatch(
        { name: "Old", notes: "Old note", updatedAt: "2026-08-01T00:00:00.000Z" },
        { name: "New", notes: "New note", updatedAt: "2026-08-02T00:00:00.000Z" }
      )
    ).toEqual({ name: "New", notes: "New note", updatedAt: "2026-08-02T00:00:00.000Z" });
    const invalidMetadata = {
      name: "New",
      notes: null,
      updatedAt: "2026-08-02T00:00:00.000Z",
      status: "sold",
    };
    expect(() =>
      applyMetalMetadataPatch(
        { name: "Old", notes: null, updatedAt: "2026-08-01T00:00:00.000Z" },
        invalidMetadata as never
      )
    ).toThrow("invalid_metal_metadata_patch");
  });

  it("dedicates action-owned tables and strips protected generic fragments", () => {
    expect([...DEDICATED_SYNC_TABLES]).toEqual(
      expect.arrayContaining([
        "financial_action_groups",
        "metal_action_evidence",
        "metal_lifecycle_events",
        "metal_rate_references",
      ])
    );
    expect(METALS_ACTION_FRAGMENT_COLUMNS.assets).toContain("acquisition_action_id");
    expect(METALS_ACTION_FRAGMENT_COLUMNS.asset_metals).toContain("purity_factor_decimal");
    expect(
      stripMetalActionFragments("assets", {
        id: "a",
        name: "Gold",
        acquisition_action_id: "action",
        purchase_price_decimal: "100",
      })
    ).toEqual({ id: "a", name: "Gold" });
  });

  it("propagates pull failures without advancing the watermark", async () => {
    const commitWatermark = jest.fn();
    await expect(
      runMetalPullStrategy({
        pull: () => Promise.reject(new Error("pull_failed")),
        commitWatermark,
      })
    ).rejects.toThrow("pull_failed");
    expect(commitWatermark).not.toHaveBeenCalled();
  });

  it("propagates push failures without marking local changes synced", async () => {
    const markSynced = jest.fn();
    await expect(
      runMetalPushStrategy({
        push: () => Promise.reject(new Error("push_failed")),
        markSynced,
      })
    ).rejects.toThrow("push_failed");
    expect(markSynced).not.toHaveBeenCalled();
  });
});
