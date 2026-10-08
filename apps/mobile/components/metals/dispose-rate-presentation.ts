import { formatCanonicalDecimalForDisplay } from "@monyvi/logic";

import type {
  DisposeRateRole,
  DisposeRateSnapshotDraft,
} from "@/services/dispose-metal-holding-command-service";

export interface DisposeRateEvidenceDisplay {
  readonly role: DisposeRateRole;
  readonly valueLabel: string;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly observedLabel: string;
}

export interface DisposeRateTrustInput {
  readonly role: DisposeRateRole;
  readonly currentFreshness: "fresh" | "stale" | "unknown";
}

export type DisposeRateSnapshotDraftLike = DisposeRateSnapshotDraft;

function formatMetalGramRate(valueDecimal: string): string {
  // Approved two-decimal metal gram-rate display. The shared canonical
  // primitive rounds only this label; the persisted draft keeps full precision.
  return formatCanonicalDecimalForDisplay(valueDecimal, {
    locale: "en",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatExactDecimal(valueDecimal: string): string {
  // Currency legs display exactly as validated, grouped for readability.
  // Rounding to the value's own scale is the identity, never a policy change.
  const fractionLength = valueDecimal.split(".")[1]?.length ?? 0;
  return formatCanonicalDecimalForDisplay(valueDecimal, {
    locale: "en",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionLength,
  });
}

function formatRateValueLabel(draft: DisposeRateSnapshotDraftLike): string {
  if (draft.kind === "metal") {
    return `${formatMetalGramRate(draft.valueDecimal)} USD/g`;
  }
  const currencyCode = draft.instrumentCode.startsWith("currency:")
    ? draft.instrumentCode.slice("currency:".length)
    : "";
  if (
    draft.unit === "currency_units_per_usd" &&
    draft.orientation === "base_per_quote"
  ) {
    return `${formatExactDecimal(draft.valueDecimal)} ${currencyCode}/USD`;
  }
  return `${formatExactDecimal(draft.valueDecimal)} USD/${currencyCode}`;
}

export function formatDisposeObservedLabel(
  providerObservedAt: string | null,
  locale: "en" | "ar",
  unknownLabel: string
): string {
  if (providerObservedAt === null) return unknownLabel;
  const parsed = new Date(providerObservedAt);
  if (!Number.isFinite(parsed.getTime())) return unknownLabel;
  // Historical references always carry an explicit year.
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(parsed);
}

export function shapeDisposeRateEvidence(
  drafts: readonly DisposeRateSnapshotDraftLike[],
  trust: readonly DisposeRateTrustInput[],
  input: { readonly locale: "en" | "ar"; readonly unknownLabel: string }
): readonly DisposeRateEvidenceDisplay[] {
  return drafts.map((draft) => {
    const current = trust.find((item) => item.role === draft.role);
    return {
      role: draft.role,
      valueLabel: formatRateValueLabel(draft),
      freshness: current?.currentFreshness ?? draft.capturedFreshness,
      observedLabel: formatDisposeObservedLabel(
        draft.providerObservedAt,
        input.locale,
        input.unknownLabel
      ),
    };
  });
}
