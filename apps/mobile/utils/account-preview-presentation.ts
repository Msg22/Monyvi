import type { Ionicons } from "@expo/vector-icons";
import type { AccountType } from "@monyvi/db";
import { getInstitutionById } from "@monyvi/logic";

import { palette } from "@/constants/colors";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { resolveAccountInstitutionPresentation } from "./account-institution-presentation";

export function getAccountPreviewFallbackIcon(
  accountType: AccountType
): keyof typeof Ionicons.glyphMap {
  if (accountType === "BANK") {
    return "business-outline";
  }
  if (accountType === "DIGITAL_WALLET") {
    return "phone-portrait-outline";
  }
  return "cash-outline";
}

export function getAccountPreviewProviderName(
  accountType: AccountType,
  institutionId: string | null,
  providerDisplayName: string,
  translateAccountType: (accountType: AccountType) => string
): string {
  const institution =
    institutionId === null ? null : getInstitutionById(institutionId);
  if (institution?.selectable) {
    return institution.shortName;
  }
  if (providerDisplayName.trim()) {
    return providerDisplayName.trim();
  }
  return translateAccountType(accountType);
}

export function formatAccountPreviewBalance(balance: string): string {
  const trimmed = balance.trim();
  if (!trimmed) {
    return "0";
  }
  return trimmed;
}

export function getAccountPreviewInstitutionLogo(
  accountType: AccountType,
  institutionId: string | null
): InstitutionLogo | null {
  const institution = resolveAccountInstitutionPresentation({
    type: accountType,
    institutionId,
  });
  return institution?.institutionId ? institution.asset.logo : null;
}

export function getAccountPreviewCardGradient({
  accountType,
  logo,
  isDark,
}: {
  readonly accountType: AccountType;
  readonly logo: InstitutionLogo | null;
  readonly isDark: boolean;
}): readonly [string, string] {
  const themeKey = isDark ? "dark" : "light";

  if (logo?.presentation?.cardGradientByMode?.[themeKey]) {
    return logo.presentation.cardGradientByMode[themeKey];
  }

  if (accountType === "BANK") {
    return [
      palette.blue[800],
      isDark ? palette.slate[950] : palette.slate[800],
    ];
  }

  if (accountType === "DIGITAL_WALLET") {
    return [
      palette.nileGreen[700],
      isDark ? palette.slate[950] : palette.slate[800],
    ];
  }

  return [
    palette.nileGreen[700],
    isDark ? palette.slate[950] : palette.nileGreen[800],
  ];
}
