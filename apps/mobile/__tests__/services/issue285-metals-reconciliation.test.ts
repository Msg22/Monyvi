import { applyMetalMetadataPatch } from "../../services/metal-metadata-service";
import {
  METALS_ACTION_FRAGMENT_COLUMNS,
  stripMetalActionFragments,
} from "../../services/sync/ownership-guards";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const WRITER_ID = "018f0c7a-1234-7abc-8def-000000000011";

describe("issue #285 Metals reconciliation regressions", () => {
  it("protects every action-owned generic-push projection field", () => {
    expect(METALS_ACTION_FRAGMENT_COLUMNS.assets).toEqual(
      expect.arrayContaining(["purchase_date", "acquisition_action_id"])
    );
    expect(METALS_ACTION_FRAGMENT_COLUMNS.asset_metals).toContain("item_form");

    expect(
      stripMetalActionFragments("assets", {
        id: "holding-1",
        type: "METAL",
        purchase_date: "2026-08-01",
        acquisition_action_id: "action-1",
      })
    ).toEqual({ id: "holding-1", type: "METAL" });
    expect(
      stripMetalActionFragments("asset_metals", {
        id: "holding-1",
        item_form: "COIN",
        weight_grams_decimal: "10",
      })
    ).toEqual({ id: "holding-1" });
  });

  it("rejects an equal-clock metadata value conflict atomically", () => {
    const current = {
      holdingId: "holding-1",
      userId: USER_ID,
      name: { value: "Server winner", writtenAt: 10, writerId: WRITER_ID },
      notes: { value: "Old note", writtenAt: 9, writerId: WRITER_ID },
    };

    expect(() =>
      applyMetalMetadataPatch(
        current,
        {
          holdingId: "holding-1",
          userId: USER_ID,
          fields: {
            name: {
              value: "Conflicting loser",
              writtenAt: 10,
              writerId: WRITER_ID,
            },
            notes: {
              value: "Would otherwise win",
              writtenAt: 11,
              writerId: WRITER_ID,
            },
          },
        },
        USER_ID
      )
    ).toThrow("metal_metadata_tuple_conflict");
  });
});
