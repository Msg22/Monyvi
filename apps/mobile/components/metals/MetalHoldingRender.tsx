import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { getMetalRenderEntry } from "@/assets/images/metals/manifest";

interface MetalHoldingRenderProps {
  readonly itemForm: "bar" | "coin" | "jewelry" | null;
  readonly metalType: "GOLD" | "SILVER";
  readonly size?: "card" | "detail";
}

export function MetalHoldingRender({
  itemForm,
  metalType,
  size = "card",
}: MetalHoldingRenderProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const metal = metalType === "GOLD" ? "gold" : "silver";
  const entry = getMetalRenderEntry(metal, itemForm);
  const label =
    entry.kind === "object"
      ? t(entry.accessibilityLabelKey, {
          form: t(entry.formLabelKey),
          metal: t(entry.metalLabelKey),
        })
      : t(entry.accessibilityLabelKey);
  const dimensionClassName = size === "detail" ? "h-36 w-36" : "h-20 w-20";

  if (entry.kind === "neutral") {
    return (
      <View
        accessibilityLabel={label}
        accessibilityRole="image"
        className={`${dimensionClassName} items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800`}
      >
        <Text className="px-2 text-center text-xs text-text-muted">
          {t("form.unknown")}
        </Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={label}
      accessibilityRole="image"
      className={dimensionClassName}
      resizeMode="contain"
      source={entry.source}
    />
  );
}
