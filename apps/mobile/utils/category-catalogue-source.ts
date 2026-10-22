/**
 * Source identity and manifest helpers for the per-backend category catalogue.
 *
 * The catalogue manifest is the authoritative *selection* source for the app:
 * it lists the complete active system-category id set that the currently
 * configured backend published. It never deletes or mutates category rows, so
 * legacy rows stay resolvable for old records while only the current
 * catalogue is offered for new choices.
 *
 * Identity is collision-free by construction: the manifest key encodes the
 * normalized public origin and the owner id. No key, token or secret is part
 * of an identity, and identities are never logged.
 */

import type { Category } from "@monyvi/db";

/** Canonical category id type (authoritative model field). */
export type CategoryId = Category["id"];

/** Manifest format version. */
export const CATEGORY_CATALOGUE_MANIFEST_VERSION = 2;

const MANIFEST_KEY_PREFIX = "__monyvi_category_catalogue";

/** Accepted catalogue manifest for one (backend, owner) pair. */
export interface CategoryCatalogueManifest {
  readonly version: number;
  readonly origin: string;
  readonly ownerId: string;
  readonly acceptedAt: number;
  /** True only for a complete, page-validated snapshot. */
  readonly snapshotComplete: boolean;
  /** Complete active system-scope id set of that snapshot. */
  readonly systemIds: readonly CategoryId[];
  /** Owner-scoped custom ids observed in that snapshot. */
  readonly customOwnerIds: readonly CategoryId[];
}

/**
 * Normalizes a Supabase base URL into the identity used for catalogue
 * scoping: scheme + host + port + path prefix. Query strings, fragments and
 * user information are dropped. An unparsable URL or an unsupported protocol
 * fails closed (no value is invented).
 */
export function normalizeCatalogueOrigin(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.host.length === 0) return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path}`;
}

/**
 * local_storage key that holds the accepted manifest for one pair.
 *
 * The key is collision-free: it encodes the normalized public origin and the
 * owner id verbatim. It never contains a key or token.
 */
export function buildCategoryCatalogueManifestKey(
  origin: string,
  ownerId: string
): string {
  return `${MANIFEST_KEY_PREFIX}:v${CATEGORY_CATALOGUE_MANIFEST_VERSION}:${encodeURIComponent(
    origin
  )}:${ownerId}`;
}

/** Serializes a manifest for local_storage. */
export function serializeCategoryCatalogueManifest(
  manifest: CategoryCatalogueManifest
): string {
  return JSON.stringify({
    version: manifest.version,
    origin: manifest.origin,
    ownerId: manifest.ownerId,
    acceptedAt: manifest.acceptedAt,
    snapshotComplete: manifest.snapshotComplete,
    systemIds: manifest.systemIds,
    customOwnerIds: manifest.customOwnerIds,
  });
}

function readIdList(value: unknown): readonly CategoryId[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    if (entry.length === 0) return null;
    if (seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

/**
 * Parses a stored manifest. Malformed, foreign or partial payloads are
 * rejected instead of being trusted, so a failed pull can never authorize an
 * empty or partial selection.
 */
export function parseCategoryCatalogueManifest(
  raw: string | null,
  expectedOrigin: string,
  expectedOwnerId: string
): CategoryCatalogueManifest | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record["version"] !== CATEGORY_CATALOGUE_MANIFEST_VERSION) return null;
  if (record["origin"] !== expectedOrigin) return null;
  if (record["ownerId"] !== expectedOwnerId) return null;
  if (record["snapshotComplete"] !== true) return null;
  const acceptedAt = record["acceptedAt"];
  if (
    typeof acceptedAt !== "number" ||
    !Number.isFinite(acceptedAt) ||
    acceptedAt <= 0
  ) {
    return null;
  }
  const systemIds = readIdList(record["systemIds"]);
  const customOwnerIds = readIdList(record["customOwnerIds"]);
  if (systemIds === null || customOwnerIds === null) return null;
  return {
    version: CATEGORY_CATALOGUE_MANIFEST_VERSION,
    origin: expectedOrigin,
    ownerId: expectedOwnerId,
    acceptedAt,
    snapshotComplete: true,
    systemIds,
    customOwnerIds,
  };
}
