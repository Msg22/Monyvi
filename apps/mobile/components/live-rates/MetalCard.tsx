/**
 * Metal Card
 *
 * Reusable half-width card for Silver, Platinum (and future Palladium).
 * Intentionally uses a dark surface (slate-800) in both themes for visual emphasis,
 * per the approved mockup.
 *
 * Architecture & Design Rationale:
 * - Pattern: Composable Component (Atomic Design Level 2 — Molecule)
 * - Why: Reused for Silver + Platinum (and future Palladium).
 * - SOLID: OCP — adding Palladium = adding another MetalCard instance, no modifications needed.
 *
 * @module MetalCard
 */

import { palette } from "@/constants/colors";
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// Types
// =============================================================================

interface MetalCardProps {
  readonly metalName: string;
  readonly price: string;
  readonly trendPercent: number;
  readonly borderColor: string;
}

// =============================================================================
// Component
// =============================================================================

export function MetalCard({
  metalName,
  price,
  trendPercent,
  borderColor,
}: MetalCardProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  const isUp = trendPercent > 0;
  const isFlat = trendPercent === 0;
  const trendColor = isFlat
    ? palette.slate[400]
    : isUp
      ? palette.nileGreen[400]
      : palette.red[400];
  const trendIcon = isFlat ? null : isUp ? "arrow-drop-up" : "arrow-drop-down";
  const trendLabel = isFlat ? "0.00%" : `${Math.abs(trendPercent).toFixed(1)}%`;
  const trendPrefix = isFlat ? "" : isUp ? "▲ " : "▼ ";

  return (
    <View
      className="flex-1 bg-slate-800 rounded-xl p-3 overflow-hidden"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      {/* Metal name with icon */}
      <View className="flex-row items-center mb-1.5">
        <FontAwesome5 name="coins" size={12} color={borderColor} solid />
        <Text className="ms-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {metalName}
        </Text>
      </View>

      {/* Price */}
      <Text className="text-base font-bold text-white">
        {t("price_per_gram", { amount: price })}
      </Text>

      {/* Trend */}
      <View className="flex-row items-center mt-1">
        {trendIcon && (
          <MaterialIcons
            name={trendIcon}
            size={16}
            color={trendColor}
            style={{ marginStart: -3, marginEnd: -2 }}
          />
        )}
        <Text style={{ color: trendColor, fontSize: 11, fontWeight: "500" }}>
          {trendPrefix}
          {trendLabel}
        </Text>
      </View>
    </View>
  );
}
