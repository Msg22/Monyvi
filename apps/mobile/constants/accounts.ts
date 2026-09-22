import { getCurrencyName } from "@/utils/currency-localization";
import type { AccountType, CurrencyType } from "@monyvi/db";
import { SUPPORTED_CURRENCIES } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";

export const ACCOUNT_TYPES = [
  {
    id: "CASH" as AccountType,
    label: "Cash",
    icon: "cash-outline" as keyof typeof Ionicons.glyphMap,
  },
  {
    id: "BANK" as AccountType,
    label: "Bank Account",
    icon: "business-outline" as keyof typeof Ionicons.glyphMap,
  },
  {
    id: "DIGITAL_WALLET" as AccountType,
    label: "Digital Wallet",
    icon: "phone-portrait-outline" as keyof typeof Ionicons.glyphMap,
  },
] as const;

export interface CurrencyOption {
  readonly value: CurrencyType;
  readonly label: string;
  readonly icon: string;
  readonly iconType: "emoji";
}

/**
 * Build currency dropdown options with localized labels for the current
 * language. Called during render (not cached at module scope) so labels
 * recompute when the app language changes.
 */
export function getCurrencyOptions(): readonly CurrencyOption[] {
  return SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.code} - ${getCurrencyName(c.code)}`,
    icon: c.flag,
    iconType: "emoji" as const,
  }));
}
