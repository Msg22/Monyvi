/**
 * Issue #255 test-only fixture/manifest helpers.
 * Pure builders, mappers, diffing and evidence recording. No Supabase
 * queries, no sync, no production imports beyond canonical DB types.
 */
import type { Database, Model } from "@nozbe/watermelondb";
import type { SupabaseDatabase } from "@monyvi/db";
import fs from "fs";
import path from "path";

export type PublicTables = SupabaseDatabase["public"]["Tables"];
export type AssetInsert = PublicTables["assets"]["Insert"];
export type AccountInsert = PublicTables["accounts"]["Insert"];
export type SenderInsert = PublicTables["account_sms_senders"]["Insert"];
export type AssetTruthRow = PublicTables["assets"]["Row"];
export type AccountTruthRow = PublicTables["accounts"]["Row"];
export type SenderTruthRow = PublicTables["account_sms_senders"]["Row"];
export type AssetTruthSelect = Pick<
  AssetTruthRow,
  | "id"
  | "user_id"
  | "name"
  | "type"
  | "currency"
  | "purchase_price"
  | "purchase_price_decimal"
  | "deleted"
>;
export interface AssetManifest {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly purchasePrice: number;
  readonly purchasePriceDecimal: string;
  readonly deleted: boolean;
}
export interface AccountManifest {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly balance: number;
  readonly financialRevision: string;
  readonly deleted: boolean;
}
export interface SenderManifest {
  readonly id: string;
  readonly accountId: string;
  readonly senderName: string;
  readonly normalizedSenderName: string;
  readonly deleted: boolean;
}
export type LocalRaw = Record<string, string | number | boolean | undefined>;
export interface ManifestDiff {
  readonly expectedCount: number;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly extraCount: number;
  readonly valueMismatchCount: number;
  readonly missingSample: readonly string[];
  readonly extraSample: readonly string[];
  readonly valueMismatchSample: readonly string[];
}
export const CONTROL_COUNT = 37;
export const LARGE_COUNT = 2_501;
export const CONTROL_ASSET_NAMESPACE = 0x25500001;
export const LARGE_ASSET_NAMESPACE = 0x25500002;
export const CAP_PROBE_NAMESPACE = 0x25500003;
export const ACCOUNT_NAMESPACE = 0x25500004;
export const SENDER_NAMESPACE = 0x25500005;
export const CONTROL_ASSET_PREFIX = "issue255-control-asset-";
export const LARGE_ASSET_PREFIX = "issue255-large-asset-";
export const CAP_PROBE_PREFIX = "issue255-cap-probe-asset-";
export const ACCOUNT_PREFIX = "issue255-parent-account-";
export const SENDER_PREFIX = "issue255-sender-";
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const evidenceOverride: unknown = process.env.ISSUE255_EVIDENCE_DIR;
const EVIDENCE_DIR =
  typeof evidenceOverride === "string" && evidenceOverride.length > 0
    ? evidenceOverride
    : path.resolve(
        __dirname,
        "../../../../../scripts/testing/issue255-sync-reproduction/evidence"
      );
export function fail(code: string): never {
  throw new Error(code);
}
export function fixtureUuid(namespace: number, index: number): string {
  const value =
    `${namespace.toString(16).padStart(8, "0")}-0000-4000-8000-` +
    index.toString(16).padStart(12, "0");
  if (!UUID_PATTERN.test(value)) fail("ISSUE255_FIXTURE_UUID_INVALID");
  return value;
}
export function padded(index: number): string {
  return String(index).padStart(5, "0");
}
export function ids(namespace: number, count: number): string[] {
  return Array.from({ length: count }, (_, offset) =>
    fixtureUuid(namespace, offset + 1)
  );
}
export function assetRows(
  namespace: number,
  prefix: string,
  count: number,
  ownerId: string
): AssetInsert[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const price = 10_000 + index;
    return {
      id: fixtureUuid(namespace, index),
      user_id: ownerId,
      name: `${prefix}${padded(index)}`,
      type: "REAL_ESTATE",
      is_liquid: false,
      purchase_price: price,
      purchase_price_decimal: price,
      purchase_date: "2026-01-15",
      currency: "EGP",
      purchase_currency: "EGP",
      notes: `issue255:${padded(index)}`,
      deleted: false,
    };
  });
}
export function accountRows(count: number, ownerId: string): AccountInsert[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      id: fixtureUuid(ACCOUNT_NAMESPACE, index),
      user_id: ownerId,
      name: `${ACCOUNT_PREFIX}${padded(index)}`,
      type: "BANK",
      currency: "EGP",
      balance: 0,
      financial_revision: 0,
      is_default: false,
      institution_id: null,
      provider_display_name: null,
      deleted: false,
    };
  });
}
export function senderRows(count: number): SenderInsert[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      id: fixtureUuid(SENDER_NAMESPACE, index),
      account_id: fixtureUuid(ACCOUNT_NAMESPACE, index),
      sender_name: `Issue255 Sender ${padded(index)}`,
      normalized_sender_name: `${SENDER_PREFIX}${padded(index)}`,
      deleted: false,
    };
  });
}
export function canonicalIntegerText(value: unknown, code: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.0+)?$/.test(value)) {
    return value.replace(/\.0+$/, "");
  }
  fail(code);
}
export function assetManifest(row: AssetTruthSelect): AssetManifest {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    purchasePrice: row.purchase_price,
    purchasePriceDecimal: canonicalIntegerText(
      row.purchase_price_decimal,
      "ISSUE255_REMOTE_ASSET_DECIMAL_INVALID"
    ),
    deleted: row.deleted,
  };
}
export function accountManifest(row: AccountTruthRow): AccountManifest {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    balance: row.balance,
    financialRevision: canonicalIntegerText(
      row.financial_revision,
      "ISSUE255_REMOTE_ACCOUNT_REVISION_INVALID"
    ),
    deleted: row.deleted,
  };
}
export function senderManifest(row: SenderTruthRow): SenderManifest {
  return {
    id: row.id,
    accountId: row.account_id,
    senderName: row.sender_name,
    normalizedSenderName: row.normalized_sender_name,
    deleted: row.deleted,
  };
}
export function raw(model: Model): LocalRaw {
  return model._raw;
}
export function localAsset(id: string, row: LocalRaw): AssetManifest {
  return {
    id,
    userId: row.user_id as string,
    name: row.name as string,
    type: row.type as string,
    currency: row.currency as string,
    purchasePrice: row.purchase_price as number,
    purchasePriceDecimal: row.purchase_price_decimal as string,
    deleted: row.deleted as boolean,
  };
}
export function localAccount(id: string, row: LocalRaw): AccountManifest {
  return {
    id,
    userId: row.user_id as string,
    name: row.name as string,
    type: row.type as string,
    currency: row.currency as string,
    balance: row.balance as number,
    financialRevision: row.financial_revision as string,
    deleted: row.deleted as boolean,
  };
}
export function localSender(id: string, row: LocalRaw): SenderManifest {
  return {
    id,
    accountId: row.account_id as string,
    senderName: row.sender_name as string,
    normalizedSenderName: row.normalized_sender_name as string,
    deleted: row.deleted as boolean,
  };
}
export function sortById<T extends { readonly id: string }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}
export async function localPrefixed<T extends { readonly id: string }>(
  database: Database,
  table: string,
  field: string,
  prefix: string,
  map: (id: string, row: LocalRaw) => T
): Promise<T[]> {
  const records = await database.get<Model>(table).query().fetch();
  const matched: T[] = records
    .filter((record) => String(raw(record)[field] ?? "").startsWith(prefix))
    .map((record) => map(record.id, raw(record)));
  return sortById(matched);
}
export async function localAssets(
  database: Database,
  prefix: string
): Promise<AssetManifest[]> {
  return localPrefixed(database, "assets", "name", prefix, localAsset);
}
export async function localAccounts(
  database: Database
): Promise<AccountManifest[]> {
  return localPrefixed(
    database,
    "accounts",
    "name",
    ACCOUNT_PREFIX,
    localAccount
  );
}
export async function localSenders(
  database: Database
): Promise<SenderManifest[]> {
  return localPrefixed(
    database,
    "account_sms_senders",
    "normalized_sender_name",
    SENDER_PREFIX,
    localSender
  );
}
export function diffManifests<T extends { readonly id: string }>(
  expected: readonly T[],
  actual: readonly T[]
): ManifestDiff {
  const actualById = new Map(actual.map((row) => [row.id, row]));
  const expectedIds = new Set(expected.map((row) => row.id));
  const missing = expected.filter((row) => !actualById.has(row.id));
  const extra = actual.filter((row) => !expectedIds.has(row.id));
  const valueMismatch = expected.filter((row) => {
    const applied = actualById.get(row.id);
    return (
      applied !== undefined && JSON.stringify(applied) !== JSON.stringify(row)
    );
  });
  return {
    expectedCount: expected.length,
    appliedCount: actual.length,
    missingCount: missing.length,
    extraCount: extra.length,
    valueMismatchCount: valueMismatch.length,
    missingSample: missing.slice(0, 10).map((row) => row.id),
    extraSample: extra.slice(0, 10).map((row) => row.id),
    valueMismatchSample: valueMismatch.slice(0, 10).map((row) => row.id),
  };
}
export function recordEvidence(name: string, payload: unknown): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, `${name}.json`),
    JSON.stringify(payload, null, 2)
  );
}
export function expectManifests<T extends { readonly id: string }>(
  actual: readonly T[],
  expected: readonly T[]
): void {
  expect(actual.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
  expect(actual).toEqual(expected);
}
