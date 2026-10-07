import {
  pullAllKeysetPages,
  type PullPageCursor,
} from "../../../services/sync/pull-pagination";

interface Row {
  readonly id: string;
  readonly updated_at: string;
}
const STAMP = "2026-10-07T10:00:00.123456+00:00";
function row(index: number, timestamp = STAMP): Row {
  return {
    id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    updated_at: timestamp,
  };
}
function cursor(record: Row): PullPageCursor {
  return { timestamp: record.updated_at, id: record.id };
}

describe("#255 shared count-aware keyset pager", () => {
  it.each([0, 1, 3, 6, 7])(
    "pulls %i rows through a server cap of three",
    async (size) => {
      const rows = Array.from({ length: size }, (_, index) => row(index + 1));
      const fetchPage = jest.fn((after: PullPageCursor | null) => {
        const remaining = rows.filter(
          (record) => after === null || record.id > after.id
        );
        return Promise.resolve({
          rows: remaining.slice(0, 3),
          count: remaining.length,
        });
      });
      expect(await pullAllKeysetPages(fetchPage, cursor)).toEqual(rows);
      expect(fetchPage).toHaveBeenCalledTimes(Math.max(1, Math.ceil(size / 3)));
      if (size > 3)
        expect(fetchPage).toHaveBeenNthCalledWith(2, cursor(row(3)));
    }
  );

  it("preserves raw microseconds and UUID ties across pages", async () => {
    const first = row(1);
    const second = row(2);
    const third = row(3, "2026-10-07T10:00:00.123457+00:00");
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ rows: [first], count: 3 })
      .mockResolvedValueOnce({ rows: [second], count: 2 })
      .mockResolvedValueOnce({ rows: [third], count: 1 });
    expect(await pullAllKeysetPages(fetchPage, cursor)).toEqual([
      first,
      second,
      third,
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(3, {
      timestamp: STAMP,
      id: second.id,
    });
  });

  it.each([null, undefined, -1, 0.5, NaN, Infinity, 0])(
    "rejects invalid remaining count %s",
    async (count) => {
      const fetchPage = jest.fn().mockResolvedValue({ rows: [row(1)], count });
      await expect(pullAllKeysetPages(fetchPage, cursor)).rejects.toThrow(
        "sync_pull_invalid_page"
      );
    }
  );

  it("rejects empty page with positive remaining count", async () => {
    await expect(
      pullAllKeysetPages(() => Promise.resolve({ rows: [], count: 1 }), cursor)
    ).rejects.toThrow("sync_pull_invalid_page");
  });

  it("rejects a non-advancing cursor, including on the final page", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ rows: [row(1)], count: 2 })
      .mockResolvedValueOnce({ rows: [row(1)], count: 1 });
    await expect(pullAllKeysetPages(fetchPage, cursor)).rejects.toThrow(
      "sync_pull_invalid_cursor"
    );
  });

  it("rejects malformed cursor", async () => {
    await expect(
      pullAllKeysetPages(
        () => Promise.resolve({ rows: [row(1)], count: 1 }),
        () => ({ timestamp: "broken", id: "broken" })
      )
    ).rejects.toThrow("sync_pull_invalid_cursor");
  });

  it("propagates later-page failure without returning partial rows", async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({ rows: [row(1)], count: 2 })
      .mockRejectedValueOnce(new Error("page-2-down"));
    await expect(pullAllKeysetPages(fetchPage, cursor)).rejects.toThrow(
      "page-2-down"
    );
  });
});
