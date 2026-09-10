/**
 * Gold Hero Card
 *
 * Full-width hero card for Gold 24K price display with 21K/18K inline chips.
 * Intentionally uses a dark surface (slate-800) in both themes for visual emphasis,
 * per the approved mockup.
 *
 * Architecture & Design Rationale:
 * - Pattern: Composable Component (Atomic Design Level 2 — Molecule)
 * - Why: Gold has a unique chip layout for 21K/18K that Silver/Platinum don't need.
 *   Separate from MetalCard to maintain SRP.
 * - SOLID: OCP — adding new karat chips is additive, no existing code changes.
 *
 * @module GoldHeroCard
 */

import { palette } from "@/constants/colors";
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

// =============================================================================
// Constants
// =============================================================================

/** Karat purity values for gold */
const KARAT_21 = 21;
const KARAT_18 = 18;

// =============================================================================
// Types
// =============================================================================

interface GoldHeroCardProps {
  readonly price24k: string;
  readonly price21k: string;
  readonly price18k: string;
  readonly trendPercent: number | null;
  readonly currencySymbol: string;
}

// =============================================================================
// Sub-components
// =============================================================================

function TrendBadge({
  trendPercent,
}: {
  readonly trendPercent: number | null;
}): React.JSX.Element | null {
  const { t } = useTranslation("metals");
  if (trendPercent === null || !Number.isFinite(trendPercent)) {
    return null;
  }

  const roundedTrend = Number(trendPercent.toFixed(1));
  if (roundedTrend === 0) {
    return (
      <View className="flex-row items-center mt-0.5 ms-1">
        <Text
          style={{
            color: palette.slate[400],
            fontSize: 12,
            fontWeight: "500",
          }}
        >
          0.0%
        </Text>
      </View>
    );
  }

  const isUp = roundedTrend > 0;
  const color = isUp ? palette.nileGreen[400] : palette.red[400];
  const icon = isUp ? "arrow-drop-up" : "arrow-drop-down";
  const label = t("trend_label", {
    direction: isUp ? t("trend_direction_up") : t("trend_direction_down"),
    percent: Math.abs(roundedTrend).toFixed(1),
  });

  return (
    <View className="flex-row items-center mt-0.5">
      <MaterialIcons
        name={icon}
        size={18}
        color={color}
        style={{ marginStart: -4 }}
      />
      <Text style={{ color, fontSize: 12, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

interface PurityChipProps {
  readonly karat: number;
  readonly price: string;
  readonly currencySymbol: string;
}

function PurityChip({
  karat,
  price,
  currencySymbol,
}: PurityChipProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View
      className="rounded-lg px-3 py-2 me-2"
      style={{ backgroundColor: `${palette.gold[600]}20` }}
    >
      <Text className="text-[10px] font-medium text-slate-400 mb-0.5">
        {t("karat_label", { karat })}
      </Text>
      <Text className="text-sm font-semibold text-white">
        {t("price_gram_with_symbol", { currencySymbol, price })}
      </Text>
    </View>
  );
}

// =============================================================================
// Component
// =============================================================================

export function GoldHeroCard({
  price24k,
  price21k,
  price18k,
  trendPercent,
  currencySymbol,
}: GoldHeroCardProps): React.JSX.Element {
  const { t } = useTranslation("metals");
  return (
    <View className="bg-slate-800 rounded-2xl p-4 overflow-hidden border-l-[3px] border-l-gold-600">
      {/* Gold label */}
      <View className="flex-row items-center mb-1">
        <FontAwesome5 name="coins" size={14} color={palette.gold[400]} />
        <Text
          className="ms-1.5 text-sm font-semibold"
          style={{ color: palette.gold[400] }}
        >
          {t("gold_label")}
        </Text>
      </View>

      {/* 24K Price — large display */}
      <Text className="text-[28px] font-bold text-white tracking-tight">
        {t("price_gram_with_symbol", { currencySymbol, price: price24k })}
      </Text>

      {/* Subtitle + trend */}
      <View className="flex-row items-center mt-0.5">
        <Text className="text-xs text-slate-400">{t("gold_24k_subtitle")}</Text>
        <TrendBadge trendPercent={trendPercent} />
      </View>

      {/* 21K and 18K chips */}
      <View className="flex-row mt-3">
        <PurityChip
          karat={KARAT_21}
          price={price21k}
          currencySymbol={currencySymbol}
        />
        <PurityChip
          karat={KARAT_18}
          price={price18k}
          currencySymbol={currencySymbol}
        />
      </View>
    </View>
  );
}
