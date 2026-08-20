import { palette } from "@/constants/colors";
import type { IconLibrary } from "@/components/common/CategoryIcon";
import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";

export interface CategoryIconSource {
  readonly icon: string;
  readonly iconLibrary: string;
  readonly color?: string | null;
  readonly isExpense: boolean;
}

export interface CategoryIconConfig {
  readonly iconName: string;
  readonly iconLibrary: IconLibrary;
  readonly iconColor: string;
}

function toIconLibrary(iconLibrary: string): IconLibrary {
  switch (iconLibrary) {
    case "MaterialCommunityIcons":
    case "FontAwesome5":
    case "MaterialIcons":
    case "Ionicons":
      return iconLibrary;
    default:
      return "Ionicons";
  }
}

export function getCategoryIconConfig(
  category: CategoryIconSource
): CategoryIconConfig {
  return {
    iconName: category.icon,
    iconLibrary: toIconLibrary(category.iconLibrary),
    iconColor:
      category.color ??
      (category.isExpense ? palette.red[500] : palette.nileGreen[500]),
  };
}

const GLYPH_MAPS: Readonly<
  Record<IconLibrary, Readonly<Record<string, string | number>> | undefined>
> = {
  Ionicons: readGlyphMap(Ionicons),
  MaterialCommunityIcons: readGlyphMap(MaterialCommunityIcons),
  FontAwesome5: readGlyphMap(FontAwesome5),
  MaterialIcons: readGlyphMap(MaterialIcons),
};

function readGlyphMap(
  component: unknown
): Readonly<Record<string, string | number>> | undefined {
  if (typeof component !== "function") return undefined;
  const glyphMap = (component as { readonly glyphMap?: unknown }).glyphMap;
  if (!glyphMap || typeof glyphMap !== "object") return undefined;
  return glyphMap as Readonly<Record<string, string | number>>;
}

export function getSafeCategoryIconConfig(
  iconName: string,
  iconLibrary: IconLibrary,
  iconColor: string
): CategoryIconConfig {
  const glyphMap = GLYPH_MAPS[iconLibrary];
  if (!glyphMap || Object.prototype.hasOwnProperty.call(glyphMap, iconName)) {
    return { iconName, iconLibrary, iconColor };
  }
  return {
    iconName: "help-circle-outline",
    iconLibrary: "Ionicons",
    iconColor,
  };
}
