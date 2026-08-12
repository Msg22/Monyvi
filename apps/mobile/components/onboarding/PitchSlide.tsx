import React from "react";
import { I18nManager, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { LanguageSwitcherPill } from "./LanguageSwitcherPill";

interface PitchSlideProps {
  readonly headline: string;
  readonly subhead: string;
  /** True only on the last slide — switches Skip → hidden, CTA → "Get Started". */
  readonly isLast: boolean;
  /** True on every slide except the first — used to render the top-left
   *  back-arrow (replacing the language pill). Slide 1 keeps the language
   *  pill at top-left because there is nowhere to go back to. */
  readonly hasPrevious: boolean;
  readonly isCompactLayout?: boolean;
  /** Zero-based index of THIS slide (passed in for the pagination dots). */
  readonly slideIndex: number;
  /** Total number of slides — used to render the dot row. */
  readonly totalSlides: number;
  readonly onSkip: () => void;
  readonly onPrevious: () => void;
  readonly onAdvance: () => void;
  readonly children: React.ReactNode;
}

const PITCH_SLIDE_BOTTOM_PADDING = 32;

/**
 * Layout per mockups (`01-slide-voice.png`, `02a-slide-sms-android.png`,
 * `02b-slide-offline-ios.png`, `03-slide-live-market.png`) and the
 * 2026-04-26 user feedback round:
 *
 * Top bar
 *   - Slide 1: language picker (top-start) + Skip (top-end).
 *   - Slides 2 & 3: back-arrow (top-start) + Skip (top-end on slide 2 only).
 *
 * Body (centered)
 *   - Headline (no eyebrow — removed 2026-04-26).
 *   - Subhead.
 *   - Mock-content card (children) — sits close to the subhead, no large
 *     vertical gap.
 *
 * Bottom
 *   - Pagination dots positioned just above the CTA so they never overlap.
 *   - CTA — "Continue" on slides 1–2, "Get Started" on the last slide.
 *     There is NO inline back-arrow next to the CTA on the last slide;
 *     the back-arrow lives at the top-left instead.
 *
 * Theme
 *   - The slide root has no forced background — it inherits whatever the
 *     stack's contentStyle decides (system theme).
 */
export function PitchSlide({
  headline,
  subhead,
  isLast,
  hasPrevious,
  isCompactLayout = false,
  slideIndex,
  totalSlides,
  onSkip,
  onPrevious,
  onAdvance,
  children,
}: PitchSlideProps): React.ReactElement {
  const { t } = useTranslation("onboarding");
  const insets = useSafeAreaInsets();

  // Build the dot indices once per `totalSlides` change. `Array.from` with
  // an index map gives a stable list of integers without using a magic
  // empty array constant.
  const dotIndices = Array.from({ length: totalSlides }, (_, i) => i);

  return (
    <View
      testID="pitch-slide-root"
      className={`flex-1 px-6 bg-background dark:bg-background-dark ${
        isCompactLayout ? "pt-8" : "pt-14"
      }`}
      style={{ paddingBottom: PITCH_SLIDE_BOTTOM_PADDING + insets.bottom }}
    >
      {/* Top bar — back-arrow on slides 2+3, language pill on slide 1 only. */}
      <View className="flex-row items-center justify-between">
        {hasPrevious ? (
          <Pressable
            onPress={onPrevious}
            accessibilityRole="button"
            accessibilityLabel={t("pitch_back")}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700"
          >
            <Ionicons
              // In RTL the visual "back" direction is to the right
              // (reading direction is right-to-left, so going BACK means
              // going forward in screen coords). Ionicons does not
              // auto-flip, so we pick the glyph explicitly per locale.
              name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"}
              size={20}
              color={palette.slate[600]}
            />
          </Pressable>
        ) : (
          <LanguageSwitcherPill />
        )}
        {!isLast ? (
          <Pressable onPress={onSkip} hitSlop={12}>
            <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {t("pitch_skip")}
            </Text>
          </Pressable>
        ) : (
          // Empty placeholder so the back-arrow stays anchored at the start.
          <View />
        )}
      </View>

      {/* Centered headline + subhead */}
      <Text
        testID="pitch-slide-headline"
        className={`text-center font-bold leading-tight text-slate-900 dark:text-white ${
          isCompactLayout ? "mt-4 text-2xl" : "mt-10 text-3xl"
        }`}
      >
        {headline}
      </Text>

      {/* Subhead is constrained to ~300px so its line breaks match the
          mockups (e.g. `03-slide-live-market.png` wraps to 3 lines:
          "...priced this / minute, not yesterday. Your net / worth always
          tells the truth."). The previous full-width subhead wrapped to
          only 2 lines on common phone widths (user-reported 2026-04-26).
          `self-center` re-centers the now-narrower text in the slide. */}
      <Text
        className={`max-w-[300px] self-center text-center text-slate-600 dark:text-slate-300 ${
          isCompactLayout
            ? "mt-1 text-xs leading-4"
            : "mt-3 text-base leading-relaxed"
        }`}
      >
        {subhead}
      </Text>

      {/* Mock-content card sits directly below the subhead — no extra
          vertical-center gap. The previous `flex-1 + justify-center`
          padded the card halfway down the leftover space, which the user
          flagged as "empty space between subtitle and card". */}
      <View
        testID="pitch-slide-content"
        className={`items-center ${isCompactLayout ? "mt-3" : "mt-6"}`}
      >
        {children}
      </View>

      {/* Spacer pushes the dot row + CTA to the bottom of the slide. */}
      <View className="flex-1" />

      {/* Pagination dots — rendered inside the slide's flow layout (not as
          an absolute overlay) so they always sit above the CTA with a
          deterministic gap, regardless of safe-area inset or device font
          metrics. */}
      <View
        testID="pitch-slide-pagination"
        className={`flex-row items-center justify-center gap-2 ${
          isCompactLayout ? "mb-3" : "mb-6"
        }`}
      >
        {dotIndices.map((i) => (
          <View
            key={i}
            className={`h-2 rounded-full ${
              i === slideIndex
                ? "w-6 bg-nileGreen-500"
                : "w-2 bg-slate-300 dark:bg-slate-600"
            }`}
          />
        ))}
      </View>

      {/* Bottom CTA */}
      <Pressable
        onPress={onAdvance}
        accessibilityRole="button"
        accessibilityLabel={
          isLast ? t("pitch_get_started") : t("pitch_continue")
        }
        className={`items-center justify-center bg-nileGreen-500 active:bg-nileGreen-600 dark:bg-nileGreen-600 ${
          isCompactLayout ? "rounded-xl py-3" : "rounded-2xl py-4"
        }`}
      >
        <Text className="text-base font-semibold text-white">
          {isLast ? t("pitch_get_started") : t("pitch_continue")}
        </Text>
      </Pressable>
    </View>
  );
}
