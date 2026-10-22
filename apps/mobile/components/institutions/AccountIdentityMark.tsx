/** Concrete account branding only. No nickname or SMS-sender provider inference. */
import { Ionicons } from "@expo/vector-icons";
import type { AccountType } from "@monyvi/db";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { palette } from "@/constants/colors";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { resolveAccountInstitutionPresentation } from "@/utils/account-institution-presentation";
import {
  InstitutionLogoMark,
  type InstitutionLogoMarkSize,
} from "./InstitutionLogoMark";

/**
 * Contrast ink for a generic account-type glyph on a colored surface.
 *
 * A colored card (the Add preview gradient) or a selected green tile already
 * carries a colored background, so a green fallback glyph would be
 * green-on-green. Real institution logos keep their own contrast surfaces;
 * only the generic type glyph uses this ink.
 */
export const ACCOUNT_IDENTITY_COLORED_SURFACE_INK = palette.slate[25];

export interface AccountIdentitySource {
  readonly type: AccountType | null;
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}

export interface AccountIdentityMarkProps {
  readonly account: AccountIdentitySource | null | undefined;
  readonly size?: InstitutionLogoMarkSize;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly fallback?: ReactNode;
  /** Already-resolved trusted presentation data from existing account cards. */
  readonly resolvedLogo?: InstitutionLogo | null;
  readonly fallbackColor?: string;
  readonly surfaceContext?: "default" | "colored-card";
  readonly defaultSurfaceClassName?: string;
  readonly defaultSurfaceStyle?: StyleProp<ViewStyle>;
  readonly containerClassName?: string;
}

function fallbackAccountIcon(
  type: AccountIdentitySource["type"] | undefined
): keyof typeof Ionicons.glyphMap {
  if (type === "BANK") return "business-outline";
  if (type === "DIGITAL_WALLET") return "wallet-outline";
  if (type === "CASH") return "cash-outline";
  return "help-circle-outline";
}

function fallbackIconSize(size: InstitutionLogoMarkSize): number {
  switch (size) {
    case "micro":
      return 14;
    case "metadata":
      return 20;
    case "field":
      return 18;
    case "group":
      return 22;
    case "dashboard":
      return 13;
    case "row":
    case "account-list":
    case "preview":
    case "compact":
      return 24;
  }
}

/**
 * Shared icon slot: canonical institution ID wins; unknown/custom/Cash stays
 * a generic account-type glyph. The established logo renderer alone owns
 * aspect ratio, dark-mode contrast metadata and bundled local assets.
 */
export function AccountIdentityMark({
  account,
  size = "metadata",
  testID,
  accessibilityLabel,
  fallback,
  resolvedLogo,
  fallbackColor,
  surfaceContext = "default",
  defaultSurfaceClassName,
  defaultSurfaceStyle,
  containerClassName,
}: AccountIdentityMarkProps): React.JSX.Element {
  const type = account?.type ?? null;
  // A generic type glyph on a colored surface needs a contrast ink; the
  // default surface keeps the established neutral glyph color.
  const resolvedFallbackColor =
    fallbackColor ??
    (surfaceContext === "colored-card"
      ? ACCOUNT_IDENTITY_COLORED_SURFACE_INK
      : palette.slate[500]);
  const institution =
    type === null
      ? null
      : resolveAccountInstitutionPresentation({
          type,
          institutionId: account?.institutionId,
          providerDisplayName: account?.providerDisplayName ?? undefined,
        });
  // The asset catalogue contains generic defaults, but unknown/custom accounts
  // deliberately show their type glyph, not a fabricated institution logo.
  const logo =
    resolvedLogo ??
    (institution?.institutionId ? institution.asset.logo : null);
  const fallbackNode = fallback ?? (
    <Ionicons
      name={fallbackAccountIcon(type)}
      size={fallbackIconSize(size)}
      color={resolvedFallbackColor}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
  if (logo === null) {
    // No theme-provider dependency for unknown/Cash fallback glyphs. Review
    // fixtures can render without a branded logo while the actual logo renderer
    // remains the single authority for contrast and image dimensions.
    const frame = {
      micro: "h-5 w-5 rounded-md",
      metadata: "h-7 w-7 rounded-md",
      field: "h-8 w-8 rounded-lg",
      group: "h-10 w-10 rounded-full",
      compact: "h-11 w-11 rounded-xl",
      row: "h-12 w-16 rounded-xl",
      "account-list": "h-12 w-16 rounded-2xl",
      dashboard: "h-9 w-12 rounded-xl",
      preview: "h-11 w-11 rounded-2xl",
    }[size];
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        className={`${containerClassName ?? ""} items-center justify-center overflow-hidden border ${defaultSurfaceClassName ?? "border-transparent bg-transparent"} ${frame}`}
        style={defaultSurfaceStyle}
      >
        {fallbackNode}
      </View>
    );
  }
  return (
    <InstitutionLogoMark
      logo={logo}
      size={size}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      surfaceContext={surfaceContext}
      defaultSurfaceClassName={defaultSurfaceClassName}
      defaultSurfaceStyle={defaultSurfaceStyle}
      containerClassName={containerClassName}
      fallback={fallbackNode}
    />
  );
}
