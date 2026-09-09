const { createHash } = require("node:crypto");

const { buildSeedIds } = require("./seed-engine");
const { buildManualQaExtraRows } = require("./manual-qa-fixture");

const FIXED_NOW = "2026-04-08T12:00:00.000Z";
const CATEGORY_IDS = {
  shopping: "00000000-0000-0000-0001-000000000004",
  income: "00000000-0000-0000-0001-000000000011",
  other: "00000000-0000-0000-0001-000000000013",
};

function deterministicUuid(seedScope, namespace, label) {
  const hex = createHash("sha256")
    .update(`monyvi:${seedScope}:${namespace}:${label}`)
    .digest("hex")
    .slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const uuidHex = chars.join("");
  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join("-");
}

function dateFromReference(reference, daysOffset) {
  const date = new Date(reference);
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function buildMetalRateReferenceRowsFromEvidence(
  evidenceRows,
  currentTimestamp = new Date().toISOString()
) {
  return evidenceRows.flatMap((evidence) => {
    if (
      evidence.kind !== "add" ||
      evidence.deleted === true ||
      !evidence.domain_payload_json ||
      !Array.isArray(evidence.domain_payload_json.rateSnapshots)
    ) {
      return [];
    }

    return evidence.domain_payload_json.rateSnapshots.flatMap((snapshot) => {
      if (
        !snapshot ||
        typeof snapshot.referenceId !== "string" ||
        (snapshot.role !== "acquisition_metal" &&
          snapshot.role !== "acquisition_purchase_currency")
      ) {
        return [];
      }

      return [
        {
          id: snapshot.referenceId,
          user_id: evidence.user_id,
          holding_id: evidence.holding_id,
          action_id: evidence.action_id,
          kind: snapshot.kind,
          role: snapshot.role,
          instrument_code: snapshot.instrumentCode,
          value_decimal: snapshot.valueDecimal,
          unit: snapshot.unit,
          orientation: snapshot.orientation,
          provider_observed_at: snapshot.providerObservedAt,
          captured_at: snapshot.capturedAt,
          captured_freshness: snapshot.capturedFreshness,
          source: snapshot.source ?? null,
          quality: snapshot.quality,
          deleted: false,
          created_at: evidence.created_at ?? FIXED_NOW,
          updated_at: currentTimestamp,
        },
      ];
    });
  });
}

function buildManualQaMetalRateReferenceRows(
  userId,
  seedScope = "manual-qa",
  currentTimestamp = new Date().toISOString()
) {
  const seedIds = buildSeedIds(userId, seedScope);
  const extraRows = buildManualQaExtraRows({
    categoryIds: CATEGORY_IDS,
    currentTimestamp,
    dateFromToday: (offset) => dateFromReference(currentTimestamp, offset),
    deterministicUuid,
    fixedNow: FIXED_NOW,
    seedIds,
    seedScope,
    userId,
  });

  return buildMetalRateReferenceRowsFromEvidence(
    extraRows.metalActionEvidence ?? [],
    currentTimestamp
  );
}

async function seedManualQaMetalRateReferences(client, userId, seedScope) {
  const rows = buildManualQaMetalRateReferenceRows(userId, seedScope);
  if (rows.length === 0) return rows;

  const result = await client.from("metal_rate_references").upsert(rows, {
    ignoreDuplicates: true,
    onConflict: "id",
  });
  if (result?.error) {
    throw new Error(
      `seed metal_rate_references: ${result.error.message ?? String(result.error)}`
    );
  }
  return rows;
}

module.exports = {
  buildManualQaMetalRateReferenceRows,
  buildMetalRateReferenceRowsFromEvidence,
  seedManualQaMetalRateReferences,
};
