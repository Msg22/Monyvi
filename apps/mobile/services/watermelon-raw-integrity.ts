import type { Model } from "@nozbe/watermelondb";

export function cloneWatermelonRaw(
  raw: Readonly<Model["_raw"]>
): Model["_raw"] {
  const source = raw as unknown as Readonly<Record<string, unknown>>;
  const clone = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value instanceof Date ? new Date(value.getTime()) : value,
    ])
  );
  return clone as unknown as Model["_raw"];
}

function rawValuesMatch(current: unknown, expected: unknown): boolean {
  if (current instanceof Date || expected instanceof Date) {
    return (
      current instanceof Date &&
      expected instanceof Date &&
      current.getTime() === expected.getTime()
    );
  }
  return Object.is(current, expected);
}

export function watermelonRawRecordsMatch(
  current: Readonly<Model["_raw"]>,
  expected: Readonly<Model["_raw"]>
): boolean {
  const currentRecord = current as unknown as Readonly<Record<string, unknown>>;
  const expectedRecord = expected as unknown as Readonly<
    Record<string, unknown>
  >;
  const currentKeys = Object.keys(currentRecord);
  const expectedKeys = Object.keys(expectedRecord);
  return (
    currentKeys.length === expectedKeys.length &&
    currentKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(expectedRecord, key) &&
        rawValuesMatch(currentRecord[key], expectedRecord[key])
    )
  );
}
