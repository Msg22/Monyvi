const { createHash } = require("node:crypto");

const QA_PROVIDER_OUTCOME_MATRIX = Object.freeze([
  "trusted-success",
  "low-confidence-success",
  "explicit-negative",
  "omission",
  "retryable-failure",
  "permanent-failure",
  "malformed",
  "incomplete",
  "invalid-identity",
  "duplicate-identity",
  "delay",
  "cancelled",
]);

function normalizeQaSmsBody(body) {
  return body
    .replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD|\u2060|\u180E/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function computeQaFingerprint(message) {
  const value = JSON.stringify({
    sender: message.address.trim().toLowerCase(),
    body: normalizeQaSmsBody(message.body),
    receivedAtMs: message.date,
  });
  return createHash("sha256").update(value).digest("hex");
}

function createProviderOutcomeMessages(messages) {
  const source = messages[0];
  if (!source) return [];
  return QA_PROVIDER_OUTCOME_MATRIX.map((providerOutcome, index) => ({
    ...source,
    id: `${source.id}:${providerOutcome}`,
    body: `${source.body} QA outcome ${providerOutcome}`,
    date: source.date + index,
    providerOutcome,
  }));
}

function buildQaRequestKeyResetFilter(profileIds) {
  return profileIds
    .map((profileId) => `request_key.like.${profileId}-%`)
    .join(",");
}

function buildCapabilityDiagnostics(snapshot, capability, limits) {
  const work = snapshot.work.filter(
    (request) => request.capability === capability
  );
  const workIds = new Set(work.map(({ id }) => id));
  const usage = snapshot.usage.filter(({ request_id: requestId }) =>
    workIds.has(requestId)
  );
  const consumedUnits = usage.reduce(
    (total, { unit_count: unitCount }) => total + unitCount,
    0
  );
  return {
    requestCount: work.length,
    refusedCount: work.filter(({ status }) => status === "refused").length,
    consumedUnits,
    remainingRollingUnits: Math.max(
      0,
      limits.maxUnitsPerRollingWindow - consumedUnits
    ),
    providerStartCount: usage.length,
    remainingBurstStarts: Math.max(
      0,
      limits.maxProviderStartsPerBurst - usage.length
    ),
  };
}

function buildServerSafeguardDiagnostics(input) {
  const activeOutcomes = input.snapshot.outcomes.filter(
    ({ deleted }) => !deleted
  );
  const availableTimes = input.snapshot.work
    .map(({ available_at: availableAt }) => availableAt)
    .filter((availableAt) => typeof availableAt === "string")
    .sort();
  const hasIncompleteWork =
    input.responses.some(({ status }) => status !== 200) ||
    input.snapshot.work.some(
      ({ status }) =>
        status === "refused" || status === "completed_with_provider_error"
    );

  return {
    profileId: input.profileId,
    profileVersion: 1,
    policyVersion: 1,
    effectiveLimits: input.policy,
    checkpointDecision: hasIncompleteWork
      ? "held_incomplete_work"
      : "eligible_after_durable_completion",
    synchronizedOutcomeTransitions: {
      active: activeOutcomes.length,
      terminal: activeOutcomes.filter(
        ({ is_terminal: isTerminal }) => isTerminal
      ).length,
    },
    earliestAvailableAt: availableTimes[0] ?? null,
    capabilities: {
      sms_full_parse: buildCapabilityDiagnostics(
        input.snapshot,
        "sms_full_parse",
        input.policy.fullParser
      ),
      sms_category_enrichment: buildCapabilityDiagnostics(
        input.snapshot,
        "sms_category_enrichment",
        input.policy.categoryEnrichment
      ),
    },
    productionProviderCallCount: 0,
    productionAllowanceChargeCount: 0,
  };
}

module.exports = {
  QA_PROVIDER_OUTCOME_MATRIX,
  buildQaRequestKeyResetFilter,
  buildServerSafeguardDiagnostics,
  computeQaFingerprint,
  createProviderOutcomeMessages,
};
