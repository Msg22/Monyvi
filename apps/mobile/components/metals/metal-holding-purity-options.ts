import type { DropdownItem } from "@/components/ui/Dropdown";
import {
  getSupportedMetalPurities,
  type SupportedMetalType,
} from "@/validation/metal-holding-form-validation";

const GOLD_FORM_PURITY_CODES = ["gold-999", "gold-875", "gold-750"];

export function getMetalHoldingPurityOptions(
  metal: SupportedMetalType
): ReadonlyArray<DropdownItem<string>> {
  const entries = getSupportedMetalPurities(metal);
  if (metal === "SILVER") {
    return entries.map((entry) => ({
      value: entry.code,
      label: entry.displayLabel,
    }));
  }
  return GOLD_FORM_PURITY_CODES.flatMap((code) => {
    const entry = entries.find((candidate) => candidate.code === code);
    return entry
      ? [{ value: entry.code, label: entry.displayLabel.split(" · ")[0] }]
      : [];
  });
}

export function getMetalHoldingFormPurityLabel(
  metal: SupportedMetalType,
  code: string,
  localizedLabel?: string
): string {
  const entry = getSupportedMetalPurities(metal).find(
    (candidate) => candidate.code === code
  );
  if (!entry) return code;
  const label = localizedLabel && localizedLabel !== entry.labelKey
    ? localizedLabel
    : entry.displayLabel;
  return metal === "GOLD" ? label.split(" · ")[0] : label;
}
