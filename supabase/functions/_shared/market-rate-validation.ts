const NON_RATE_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "timestamp_currency",
  "timestamp_metal",
]);

export function assertPositiveFiniteRateValues(record: object): void {
  for (const [column, value] of Object.entries(record)) {
    if (NON_RATE_COLUMNS.has(column)) {
      continue;
    }

    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`INVALID_MARKET_RATE:${column}`);
    }
  }
}
