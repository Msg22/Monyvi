import { assertPushRecordBelongsToCurrentUser } from "../../services/sync/ownership-guards";

describe("sync ownership guards", () => {
  it("allows user-owned writable records for the authenticated user", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "profiles",
        { id: "profile-1", user_id: "current-user" },
        "current-user",
        undefined,
        null
      )
    ).not.toThrow();
  });

  it("rejects writable records owned by a different user", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "profiles",
        { id: "profile-1", user_id: "previous-user" },
        "current-user",
        undefined,
        null
      )
    ).toThrow("Refusing to sync foreign local changes for profiles");
  });

  it("allows shared system categories without forcing user ownership", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "categories",
        {
          id: "00000000-0000-0000-0001-000000000002",
          user_id: null,
          is_system: true,
        },
        "current-user",
        undefined,
        null
      )
    ).not.toThrow();
  });

  it("rejects local-only shared system categories before push", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "categories",
        {
          id: "local-food",
          user_id: null,
          is_system: true,
        },
        "current-user",
        undefined,
        null
      )
    ).toThrow("Refusing to sync foreign local changes for categories");
  });

  it("rejects unowned non-system categories", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "categories",
        { id: "category-1", user_id: null, is_system: false },
        "current-user",
        undefined,
        null
      )
    ).toThrow("Refusing to sync foreign local changes for categories");
  });

  it("allows child-table records only when the local parent is owned", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "asset_metals",
        { id: "metal-1", asset_id: "asset-1" },
        "current-user",
        { parentTable: "assets", foreignKey: "asset_id" },
        ["asset-1"]
      )
    ).not.toThrow();
  });

  it("rejects child-table records when the parent id is missing or not owned", () => {
    expect(() =>
      assertPushRecordBelongsToCurrentUser(
        "asset_metals",
        { id: "metal-1", asset_id: "asset-foreign" },
        "current-user",
        { parentTable: "assets", foreignKey: "asset_id" },
        ["asset-1"]
      )
    ).toThrow("Refusing to sync foreign local changes for asset_metals");
  });
});
