jest.mock("@monyvi/db", () => ({
  schema: { tables: { categories: {} } },
}));

import {
  readCatalogueScope,
  resolveCatalogueCompleteness,
} from "@/services/sync/pull-strategies";

const OWNER = "owner-1";

function row(overrides: {
  readonly id: string;
  readonly system_name?: string;
  readonly is_system?: boolean;
  readonly user_id?: string | null;
  readonly deleted?: boolean;
}): Record<string, unknown> {
  return {
    id: overrides.id,
    system_name: overrides.system_name ?? "electricity",
    is_system: overrides.is_system ?? true,
    user_id: overrides.user_id === undefined ? null : overrides.user_id,
    deleted: overrides.deleted ?? false,
  };
}

describe("readCatalogueScope", (): void => {
  it("collects active system ids and the owner's own custom ids", (): void => {
    const scope = readCatalogueScope(
      [
        row({ id: "system-1" }),
        row({ id: "custom-1", is_system: false, user_id: OWNER }),
        row({ id: "foreign-1", is_system: false, user_id: "owner-2" }),
        row({ id: "unclassified-1", is_system: false }),
      ],
      OWNER
    );

    expect(scope.systemIds).toEqual(["system-1"]);
    expect(scope.customOwnerIds).toEqual(["custom-1"]);
  });

  it("excludes tombstoned system and custom rows", (): void => {
    const scope = readCatalogueScope(
      [
        row({ id: "system-active" }),
        row({ id: "system-tombstone", deleted: true }),
        row({
          id: "custom-tombstone",
          is_system: false,
          user_id: OWNER,
          deleted: true,
        }),
      ],
      OWNER
    );

    expect(scope.systemIds).toEqual(["system-active"]);
    expect(scope.customOwnerIds).toEqual([]);
  });

  it("ignores rows without a usable id", (): void => {
    const scope = readCatalogueScope(
      [{ ...row({ id: "system-1" }), id: 42 }],
      OWNER
    );

    expect(scope.systemIds).toEqual([]);
  });
});

describe("resolveCatalogueCompleteness", (): void => {
  it("is complete only for a full window pull", (): void => {
    expect(resolveCatalogueCompleteness(null)).toBe(true);
    expect(resolveCatalogueCompleteness("2026-10-21T00:00:00.000Z")).toBe(
      false
    );
  });
});
