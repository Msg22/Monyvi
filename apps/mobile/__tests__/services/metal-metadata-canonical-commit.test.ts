import { Database } from "@nozbe/watermelondb";

import { Asset } from "../../../../packages/db/src/models/Asset";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import {
  commitCanonicalMetalMetadataLocally,
  createMetalMetadataService,
} from "../../services/metal-metadata-service";
import {
  createMetalMetadataFixtureDatabase,
  type MetalMetadataFixtureDatabase,
} from "./metal-metadata-test-database";

jest.mock("@monyvi/db", (): unknown => {
  const schemaModule: unknown = jest.requireActual(
    "../../../../packages/db/src/schema"
  );
  return schemaModule;
});
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";
const WRITER_ID = "018f0c7a-1234-7abc-8def-000000000020";

function createMetadataDatabase(): Promise<MetalMetadataFixtureDatabase> {
  return createMetalMetadataFixtureDatabase({
    userId: USER_ID,
    acquisitionActionId: ACTION_ID,
    holdingId: HOLDING_ID,
  });
}

async function applyLocalNameEdit(database: Database): Promise<void> {
  await createMetalMetadataService({
    database,
    getCurrentUserId: () => Promise.resolve(USER_ID),
  }).applyPatch({
    holdingId: HOLDING_ID,
    userId: USER_ID,
    fields: {
      name: { value: "Newer local edit", writtenAt: 20, writerId: WRITER_ID },
    },
  });
}

describe("commitCanonicalMetalMetadataLocally clock guard", () => {
  it("keeps a newer local metadata edit when the canonical outcome is older", async () => {
    const { database } = await createMetadataDatabase();
    await applyLocalNameEdit(database);

    await database.write(() =>
      commitCanonicalMetalMetadataLocally(
        database,
        {
          status: "ignored",
          holdingId: HOLDING_ID,
          canonicalMetadata: {
            name: {
              value: "Older canonical",
              writtenAt: 10,
              writerId: WRITER_ID,
            },
            notes: null,
          },
        },
        USER_ID
      )
    );

    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(asset?.name).toBe("Newer local edit");
    expect(state?.nameWrittenAt).toBe(20);
  });

  it("installs canonical metadata while it wins the local clock comparison", async () => {
    const { database } = await createMetadataDatabase();
    await applyLocalNameEdit(database);

    await database.write(() =>
      commitCanonicalMetalMetadataLocally(
        database,
        {
          status: "applied",
          holdingId: HOLDING_ID,
          canonicalMetadata: {
            name: {
              value: "Newer canonical",
              writtenAt: 30,
              writerId: WRITER_ID,
            },
            notes: {
              value: "Canonical note",
              writtenAt: 5,
              writerId: WRITER_ID,
            },
          },
        },
        USER_ID
      )
    );

    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(asset?.name).toBe("Newer canonical");
    expect(state?.nameWrittenAt).toBe(30);
    expect(asset?.notes).toBe("Canonical note");
    expect(state?.notesWrittenAt).toBe(5);
  });
});
