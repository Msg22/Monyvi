/**
 * #395 T020 — approved B1 R3-07 quiet disclosure and R3-12 Why sheet.
 * Account eligibility, counts and modal visibility are supplied by the parent.
 * Pure presentation: no review state, persistence, selection or Save logic.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TouchableOpacity,
  useColorScheme, useWindowDimensions, View, type TextStyle,
} from "react-native";

import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import {
  shouldUseCompactLayout, shouldUseDenseRowCompactLayout,
} from "@/constants/ui";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

export interface DefaultAccountInfoProps {
  readonly defaultAccountName: string;
  readonly assignmentCount: number;
  readonly onWhyPress: () => void;
}

export interface DefaultAccountWhySheetProps {
  readonly visible: boolean;
  readonly defaultAccountName: string;
  readonly assignmentCount: number;
  readonly onClose: () => void;
}

/** Text-level isolation only: keep the original stored account name untouched. */
const RTL_SCRIPT = /[\u0590-\u08ff]/u;
const LATIN_OR_DIGITS = /[A-Za-z0-9]/u;
const FSI = "\u2068";
const PDI = "\u2069";

function accountNameForDisplay(name: string, language: "en" | "ar"): string {
  const containsRTL = RTL_SCRIPT.test(name);
  const containsLatinOrDigits = LATIN_OR_DIGITS.test(name);
  const needsIsolation =
    (containsRTL && containsLatinOrDigits) ||
    (language === "ar" && containsLatinOrDigits) ||
    (language === "en" && containsRTL);
  return needsIsolation ? `${FSI}${name}${PDI}` : name;
}

export function DefaultAccountInfo({
  defaultAccountName, assignmentCount, onWhyPress,
}: DefaultAccountInfoProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const { width, fontScale } = useWindowDimensions();
  const colorScheme = useColorScheme();
  if (assignmentCount <= 0) return null;

  return (
    <QuietDefaultDisclosure
      label={t("account_review_default_note", {
        count: assignmentCount,
        defaultAccountName: accountNameForDisplay(defaultAccountName, language),
      })}
      whyLabel={t("account_review_default_why_trigger")}
      onWhyPress={onWhyPress}
      compact={shouldUseDenseRowCompactLayout(width, fontScale)}
      rtl={language === "ar"}
      iconColor={colorScheme === "dark" ? palette.slate[400] : palette.slate[500]}
    />
  );
}

interface QuietDefaultDisclosureProps {
  readonly label: string;
  readonly whyLabel: string;
  readonly onWhyPress: () => void;
  readonly compact: boolean;
  readonly rtl: boolean;
  readonly iconColor: string;
}

function QuietDefaultDisclosure(props: QuietDefaultDisclosureProps): React.JSX.Element {
  const { compact, rtl, whyLabel, onWhyPress } = props;
  return (
    <View
      testID="account-review-default-info"
      className="w-full max-w-[350px] self-center py-2 dark:bg-transparent"
    >
      <View
        className={compact ? "items-start gap-1" :
          rtl ? "flex-row-reverse items-center gap-2" : "flex-row items-center gap-2"}
      >
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={props.iconColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <QuietDefaultNote label={props.label} compact={compact} rtl={rtl} />
        {!compact ? <WhyLink label={whyLabel} onPress={onWhyPress} rtl={rtl} /> : null}
      </View>
      {compact ? <WhyLink label={whyLabel} onPress={onWhyPress} rtl={rtl} /> : null}
    </View>
  );
}

function QuietDefaultNote({
  label, compact, rtl,
}: {
  readonly label: string;
  readonly compact: boolean;
  readonly rtl: boolean;
}): React.JSX.Element {
  const writingDirection: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <Text
      style={{ writingDirection }}
      className={`${rtl ? "text-right" : "text-left"} ${
        compact
          ? "w-full text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark"
          : "min-w-0 flex-1 text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark"
      }`}
    >
      {label}
    </Text>
  );
}

function WhyLink({
  label, onPress,
  rtl,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      testID="account-review-default-why-trigger"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.75}
      className={rtl
        ? "min-h-11 min-w-11 items-center justify-center self-end"
        : "min-h-11 min-w-11 items-center justify-center self-start"}
    >
      <Text className="text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function DefaultAccountWhySheet({
  visible, defaultAccountName, assignmentCount, onClose,
}: DefaultAccountWhySheetProps): React.JSX.Element | null {
  const bottomInset = useModalBottomInset();
  const { height, width, fontScale } = useWindowDimensions();
  if (!visible || assignmentCount <= 0) return null;
  const maxHeight = Math.max(0, (height - bottomInset) * 0.8);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <WhyBackdrop onClose={onClose} />
        <WhyPanel
          defaultAccountName={defaultAccountName}
          assignmentCount={assignmentCount}
          onClose={onClose}
          bottomInset={bottomInset}
          maxHeight={maxHeight}
          compact={shouldUseCompactLayout(width, fontScale)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pointer dismissal outside the accessibility-modal panel, not a hidden button. */
function WhyBackdrop({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity
      testID="account-review-default-why-backdrop"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onClose}
      activeOpacity={1}
      className="absolute inset-0"
    >
      <View className="flex-1 bg-black/60" />
    </TouchableOpacity>
  );
}

interface WhyPanelProps {
  readonly defaultAccountName: string;
  readonly assignmentCount: number;
  readonly onClose: () => void;
  readonly bottomInset: number;
  readonly maxHeight: number;
  readonly compact: boolean;
}

function WhyPanel(props: WhyPanelProps): React.JSX.Element {
  return (
    <View
      testID="account-review-default-why-sheet"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      className="w-full overflow-hidden rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      style={{ maxHeight: props.maxHeight, paddingBottom: props.bottomInset }}
    >
      <View
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        className="mt-3 mb-2 h-1 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-600"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="shrink"
        contentContainerClassName="px-5 pb-3"
      >
        <View className="w-full max-w-[350px] self-center">
          <WhyHeading compact={props.compact} />
          <WhyCopy name={props.defaultAccountName} count={props.assignmentCount} />
        </View>
      </ScrollView>
      <WhyDismiss onClose={props.onClose} />
    </View>
  );
}

function WhyCopy({
  name, count,
}: { readonly name: string; readonly count: number }): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const rtl = language === "ar";
  const writingDirection: TextStyle["writingDirection"] = rtl ? "rtl" : "ltr";
  return (
    <>
      <Text
        className={`${rtl ? "text-right" : "text-left"} mt-4 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark`}
        style={{ writingDirection }}
      >
        {t("account_review_default_why_body", { count, defaultAccountName: accountNameForDisplay(name, language) })}
      </Text>
      <Text
        className={`${rtl ? "text-right" : "text-left"} mt-3 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark`}
        style={{ writingDirection }}
      >
        {t("account_review_default_edit_reminder")}
      </Text>
      <Text
        className={`${rtl ? "text-right" : "text-left"} mt-3 text-sm leading-5 text-text-muted dark:text-text-muted-dark`}
        style={{ writingDirection }}
      >
        {t("account_review_default_why_boundary")}
      </Text>
    </>
  );
}

function WhyDismiss({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation("transactions");
  return (
    <View className="w-full px-5 pt-2 pb-3">
      <TouchableOpacity
        testID="account-review-default-why-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t("account_review_default_why_action")}
        onPress={onClose}
        activeOpacity={0.8}
        className="min-h-12 w-full max-w-[350px] self-center items-center justify-center rounded-lg bg-nileGreen-600 px-3"
      >
        <Text className="text-base font-semibold text-white">
          {t("account_review_default_why_action")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function WhyHeading({ compact }: { readonly compact: boolean }): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();
  const colorScheme = useColorScheme();
  const rtl = language === "ar";
  return (
    <View className={compact ? "items-start gap-3" :
      rtl ? "flex-row-reverse items-center gap-3" : "flex-row items-center gap-3"}>
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-nileGreen-50 dark:bg-nileGreen-900">
        <Ionicons name="business-outline" size={22}
          color={colorScheme === "dark" ? palette.nileGreen[400] : palette.nileGreen[700]}
          accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <Text accessibilityRole="header"
        className={compact
          ? "w-full text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"
          : "min-w-0 flex-1 text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark"}
      >
        {t("account_review_default_why_title")}
      </Text>
    </View>
  );
}
