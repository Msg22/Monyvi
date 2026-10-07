import {
  pullCategories,
  pullChildTable,
  pullMetalDedicatedTable,
  pullSnapshotTable,
  pullUserTable,
} from "../../../services/sync/pull-strategies";
import { pullSnapshotDeletions } from "../../../services/sync/snapshot-deletion-pull";

// Pull caller contracts need schema metadata, not a native database instance.
jest.mock("@monyvi/db", () => ({ schema: { tables: {} } }));

const mockRpc = jest.fn();
const mockFrom = jest.fn<unknown, [string]>();
jest.mock("../../../services/supabase", () => ({
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (...args: readonly unknown[]): unknown => mockRpc(...args),
  },
}));
const USER = "11111111-1111-4111-8111-111111111111";
const FIRST = "aaaaaaaa-0000-4000-8000-000000000001";
const SECOND = "bbbbbbbb-0000-4000-8000-000000000002";
const STAMP = "2026-10-05T10:00:00.123456+00:00";
const LOWER = "2026-10-01T00:00:00.000Z";
const UPPER = "2026-10-07T12:00:00.000Z";

function chain(
  data: ReadonlyArray<Record<string, unknown>>,
  count: number
): Record<string, jest.Mock> {
  const query: Record<string, jest.Mock> = {};
  for (const method of [
    "select",
    "eq",
    "gt",
    "lte",
    "or",
    "limit",
    "order",
    "in",
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.then = jest.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, count, error: null }).then(resolve)
  );
  return query;
}
beforeEach(() => {
  jest.clearAllMocks();
});

describe("#255 public pull caller contracts", () => {
  it("retains owner, bounds, exact financial text, and same-query exact count", async () => {
    const query = chain([], 0);
    mockFrom.mockReturnValue(query);
    await pullUserTable("assets", USER, LOWER, UPPER);
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "purchase_price_decimal_text:purchase_price_decimal::text"
      ),
      { count: "exact" }
    );
    expect(query.eq).toHaveBeenCalledWith("user_id", USER);
    expect(query.gt).toHaveBeenCalledWith("updated_at", LOWER);
    expect(query.lte).toHaveBeenCalledWith("updated_at", UPPER);
  });

  it("retains current-owner and shared-category scope on every page", async () => {
    const first = chain([{ id: FIRST, updated_at: STAMP, deleted: true }], 2);
    const second = chain([{ id: SECOND, updated_at: STAMP, deleted: true }], 1);
    mockFrom.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const result = await pullCategories(USER, LOWER, UPPER);
    expect(result.deleted).toEqual([FIRST, SECOND]);
    for (const query of [first, second]) {
      expect(query.or).toHaveBeenCalledWith(
        `user_id.eq.${USER},user_id.is.null`
      );
      expect(query.select).toHaveBeenCalledWith("*", { count: "exact" });
    }
    expect(second.or).toHaveBeenCalledWith(
      `updated_at.gt.${STAMP},and(updated_at.eq.${STAMP},id.gt.${FIRST})`
    );
  });

  it("pages children through owned parents without excluding soft-deleted parents or fetching IDs", async () => {
    const first = chain(
      [
        {
          id: FIRST,
          updated_at: STAMP,
          deleted: true,
          sync_owner: { user_id: USER, deleted: true },
        },
      ],
      2
    );
    const second = chain(
      [
        {
          id: SECOND,
          updated_at: STAMP,
          deleted: false,
          account_id: FIRST,
          sender: "Bank",
          sync_owner: { user_id: USER, deleted: true },
        },
      ],
      1
    );
    mockFrom.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const result = await pullChildTable(
      "account_sms_senders",
      { parentTable: "accounts", foreignKey: "account_id" },
      USER,
      LOWER,
      UPPER
    );
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual([
      "account_sms_senders",
      "account_sms_senders",
    ]);
    expect(first.select).toHaveBeenCalledWith(
      expect.stringContaining("sync_owner:accounts!inner(user_id)"),
      { count: "exact" }
    );
    for (const query of [first, second]) {
      expect(query.eq).toHaveBeenCalledWith("sync_owner.user_id", USER);
      expect(query.eq).not.toHaveBeenCalledWith("sync_owner.deleted", false);
      expect(query.in).not.toHaveBeenCalled();
    }
    expect(result.deleted).toEqual([FIRST]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).not.toHaveProperty("sync_owner");
  });

  it("keeps snapshot retention, owner and incremental bounds", async () => {
    jest.useFakeTimers().setSystemTime(new Date(UPPER));
    try {
      const query = chain([], 0);
      mockFrom.mockReturnValue(query);
      await pullSnapshotTable("daily_snapshot_assets", USER, LOWER, UPPER);
      expect(query.eq).toHaveBeenCalledWith("user_id", USER);
      expect(query.gt).toHaveBeenCalledWith(
        "created_at",
        "2026-07-09T12:00:00.000Z"
      );
      expect(query.gt).toHaveBeenCalledWith("created_at", LOWER);
      expect(query.lte).toHaveBeenCalledWith("created_at", UPPER);
    } finally {
      jest.useRealTimers();
    }
  });

  it("dedicated pulls obey count EOF even below requested page size", async () => {
    const first = chain([{ id: FIRST, updated_at: STAMP, deleted: true }], 2);
    const second = chain([{ id: SECOND, updated_at: STAMP, deleted: true }], 1);
    mockFrom.mockReturnValueOnce(first).mockReturnValueOnce(second);
    expect(
      (
        await pullMetalDedicatedTable(
          "metal_holding_states",
          USER,
          LOWER,
          UPPER
        )
      ).deleted
    ).toEqual([FIRST, SECOND]);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});

describe("#255 snapshot deletion journal", () => {
  function journal(entryId: string, table: string): Record<string, unknown> {
    return {
      entry_id: entryId,
      user_id: USER,
      table_name: table,
      record_id: entryId,
      published_at: STAMP,
    };
  }
  it("buffers tied publications across pages with raw entry cursor and no caller owner", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          rows: [journal(FIRST, "daily_snapshot_assets")],
          count: 2,
          upperWatermark: UPPER,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          rows: [journal(SECOND, "daily_snapshot_balance")],
          count: 1,
          upperWatermark: UPPER,
        },
        error: null,
      });
    const result = await pullSnapshotDeletions(LOWER, UPPER);
    expect(result).toEqual({
      daily_snapshot_assets: [FIRST],
      daily_snapshot_balance: [SECOND],
      daily_snapshot_net_worth: [],
    });
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      "pull_snapshot_deletions_page_v1",
      {
        p_last_pulled_at: LOWER,
        p_upper_watermark: UPPER,
        p_after_published_at: STAMP,
        p_after_entry_id: FIRST,
        p_limit: 500,
      }
    );
    for (const [, args] of mockRpc.mock.calls)
      expect(args).not.toHaveProperty("p_user_id");
  });
  it("rejects a later journal page instead of returning partial deletions", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          rows: [journal(FIRST, "daily_snapshot_assets")],
          count: 2,
          upperWatermark: UPPER,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "page-2-down" } });
    await expect(pullSnapshotDeletions(LOWER, UPPER)).rejects.toThrow(
      "page-2-down"
    );
  });
});
