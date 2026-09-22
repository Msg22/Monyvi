import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";

export interface MetalMetadataFixtureIds {
  readonly userId: string;
  readonly acquisitionActionId: string;
  readonly holdingId: string;
}

export interface MetalMetadataFixtureDatabase {
  readonly adapter: SQLiteAdapter;
  readonly database: Database;
}

export async function createMetalMetadataFixtureDatabase(
  ids: MetalMetadataFixtureIds
): Promise<MetalMetadataFixtureDatabase> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  const database = new Database({
    adapter,
    modelClasses: [Asset, MetalHoldingState] as Array<typeof Model>,
  });
  await database.write(async (): Promise<void> => {
    const asset = database.get<Asset>("assets").prepareCreate((row) => {
      row._raw.id = ids.holdingId;
      row.acquisitionActionId = ids.acquisitionActionId;
      row.currency = "EGP";
      row.deleted = false;
      row.isLiquid = false;
      row.name = "Baseline";
      row.notes = "Baseline note";
      row.purchaseCurrency = "EGP";
      row.purchaseDate = new Date("2026-08-01T00:00:00.000Z");
      row.purchasePrice = 100;
      row.purchasePriceDecimal = "100";
      row.type = "METAL";
      row.updatedAt = new Date();
      row.userId = ids.userId;
    });
    const state = database
      .get<MetalHoldingState>("metal_holding_states")
      .prepareCreate((row) => {
        row._raw.id = ids.holdingId;
        row.deleted = false;
        row.effectiveActionId = ids.acquisitionActionId;
        row.effectiveEventId = ids.acquisitionActionId;
        row.financialRevision = "4";
        row.holdingId = ids.holdingId;
        row.isVisible = true;
        row.nameWrittenAt = null;
        row.nameWriterId = null;
        row.notesWrittenAt = null;
        row.notesWriterId = null;
        row.reconciliationState = "accepted";
        row.status = "sold";
        row.updatedAt = new Date();
        row.userId = ids.userId;
      });
    await database.batch(asset, state);
  });
  return { adapter, database };
}
