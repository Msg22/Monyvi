export const PULL_PAGE_SIZE = 500;

export interface PullPageCursor {
  readonly timestamp: string;
  readonly id: string;
}
export interface PullPage<Row> {
  readonly rows: readonly Row[];
  readonly count: number | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/;

/** Comparison only: preserve the original raw timestamp in the outgoing cursor. */
function cursorOrderKey(cursor: PullPageCursor): string {
  const match = UTC_TIMESTAMP.exec(cursor.timestamp);
  if (!match || !UUID_PATTERN.test(cursor.id)) {
    throw new Error("sync_pull_invalid_cursor");
  }
  // PostgreSQL omits trailing fractional zeroes; padding compares microseconds
  // without converting through JavaScript's millisecond Date precision.
  return `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(6, "0")}:${cursor.id.toLowerCase()}`;
}

function assertRows(rows: unknown): void {
  if (!Array.isArray(rows)) throw new Error("sync_pull_invalid_page");
}

export async function pullAllKeysetPages<Row>(
  fetchPage: (cursor: PullPageCursor | null) => Promise<PullPage<Row>>,
  readCursor: (row: Row) => PullPageCursor
): Promise<readonly Row[]> {
  let collected: readonly Row[] = [];
  let cursor: PullPageCursor | null = null;
  for (;;) {
    const { rows, count } = await fetchPage(cursor);
    assertRows(rows);
    if (
      !Number.isSafeInteger(count) ||
      count === null ||
      count < rows.length ||
      (count > 0 && rows.length === 0)
    ) {
      throw new Error("sync_pull_invalid_page");
    }
    const last = rows[rows.length - 1];
    if (last !== undefined) {
      const next = readCursor(last);
      const nextKey = cursorOrderKey(next);
      if (cursor !== null && nextKey <= cursorOrderKey(cursor)) {
        throw new Error("sync_pull_invalid_cursor");
      }
      cursor = next;
    }
    collected = [...collected, ...rows];
    if (count === rows.length) return collected;
  }
}

export function pullCursorFilter(
  column: "updated_at" | "created_at",
  cursor: PullPageCursor
): string {
  return `${column}.gt.${cursor.timestamp},and(${column}.eq.${cursor.timestamp},id.gt.${cursor.id})`;
}

export function readPullCursor(
  row: Readonly<Record<string, unknown>>,
  column: "updated_at" | "created_at"
): PullPageCursor {
  if (typeof row[column] !== "string" || typeof row.id !== "string") {
    throw new Error("sync_pull_invalid_cursor");
  }
  return { timestamp: row[column], id: row.id };
}
