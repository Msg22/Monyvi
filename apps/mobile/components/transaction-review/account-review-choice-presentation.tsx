/**
 * #395 T038 private sheet framing, approved EN/AR fallback copy and selection UI.
 * T072 installs the same keys in serialized locales; no domain decisions here.
 */
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { t } from "i18next";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { ReviewSheetHandle } from "./shared-account-presentation";

export type ChoiceLanguage = "en" | "ar";
const fallbackCopy = {
  en: {
    account_review_choice_cancel: "Cancel",
    account_review_choice_close: "Close",
    account_review_choice_use_account: "Use account",
    account_review_choice_use_currency: "Use currency",
    account_review_choice_empty: "No eligible accounts available.",
    account_review_choice_preserve_selection:
      "Transaction selections stay unchanged.",
    account_review_currency_title: "Confirm currency",
    account_review_currency_choose_another: "Choose another currency",
    account_review_currency_unselected: "No account is selected yet.",
  },
  ar: {
    account_review_choice_cancel: "إلغاء",
    account_review_choice_close: "إغلاق",
    account_review_choice_use_account: "استخدام الحساب",
    account_review_choice_use_currency: "استخدام العملة",
    account_review_choice_empty: "لا توجد حسابات مناسبة متاحة.",
    account_review_choice_preserve_selection: "ستبقى المعاملات المحددة كما هي.",
    account_review_currency_title: "تأكيد العملة",
    account_review_currency_choose_another: "اختيار عملة أخرى",
    account_review_currency_unselected: "لم يتم اختيار حساب بعد.",
  },
};

export type ChoiceCopyKey = keyof typeof fallbackCopy.en;
export function choiceCopy(
  key: ChoiceCopyKey,
  language: ChoiceLanguage
): string {
  return t(key, {
    ns: "transactions",
    lng: language,
    defaultValue: fallbackCopy[language][key],
  });
}
export function useChoiceLanguage(): ChoiceLanguage {
  const { i18n } = useTranslation("common");
  return i18n.language.startsWith("ar") ? "ar" : "en";
}

export interface ChoiceModalFrameProps {
  readonly visible: boolean;
  readonly testID: string;
  readonly title: string;
  readonly contextSubtitle?: string;
  readonly closeAccessibilityLabel: string;
  readonly onClose: () => void;
  readonly language: ChoiceLanguage;
  readonly children: React.ReactNode;
  readonly footer: React.ReactNode;
}
interface ChoiceModalContentProps {
  readonly props: ChoiceModalFrameProps;
  readonly maxHeight: number;
}
/** Render only the existing title/close header host subtree. */
function ChoiceModalHeader({
  props,
}: {
  readonly props: ChoiceModalFrameProps;
}): React.JSX.Element {
  const rtl = props.language === "ar";
  return (
    <View
      className={
        rtl
          ? "flex-row-reverse items-start gap-3"
          : "flex-row items-start gap-3"
      }
    >
      <Text
        accessibilityRole="header"
        className={
          "min-w-0 flex-1 text-xl font-bold leading-7 text-text-primary dark:text-text-primary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {props.title}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={choiceCopy(
          "account_review_choice_close",
          props.language
        )}
        className="h-11 w-11 items-center justify-center"
        onPress={props.onClose}
      >
        <Ionicons name="close-outline" size={24} color={palette.slate[400]} />
      </TouchableOpacity>
    </View>
  );
}

function ChoiceModalContent({
  props,
  maxHeight,
}: ChoiceModalContentProps): React.JSX.Element {
  const rtl = props.language === "ar";
  return (
    <View
      className="w-full overflow-hidden rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      style={{ maxHeight }}
    >
      <ReviewSheetHandle />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-3"
      >
        <View className="w-full max-w-[350px] self-center gap-3">
          <ChoiceModalHeader props={props} />
          {props.contextSubtitle ? (
            <Text
              className={
                "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
                (rtl ? "text-right" : "text-left")
              }
            >
              {props.contextSubtitle}
            </Text>
          ) : null}
          {props.children}
        </View>
      </ScrollView>
      {props.footer}
    </View>
  );
}
/** One decorative inset fill; the ancestor alone applies bottom padding. */
function ChoiceBottomInsetBackground({
  inset,
}: {
  readonly inset: number;
}): React.JSX.Element {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className="absolute inset-x-0 bottom-0 bg-surface dark:bg-surface-dark"
      style={{ height: inset }}
    />
  );
}

/** Backdrop retains its named press target; View owns translucent paint. */
function ChoiceModalBackdrop({
  label,
  onClose,
}: {
  readonly label: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onClose}
      activeOpacity={1}
      className="absolute inset-0"
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        className="flex-1 bg-black/60"
      />
    </TouchableOpacity>
  );
}

export function ChoiceModalFrame(
  props: ChoiceModalFrameProps
): React.JSX.Element | null {
  const inset = useModalBottomInset();
  const { height } = useWindowDimensions();
  if (!props.visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          testID={props.testID}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          className="flex-1 justify-end dark:bg-transparent"
          style={{ paddingBottom: inset }}
        >
          <ChoiceModalBackdrop
            label={props.closeAccessibilityLabel}
            onClose={props.onClose}
          />
          <ChoiceModalContent
            props={props}
            maxHeight={Math.max(0, (height - inset) * 0.8)}
          />
          <ChoiceBottomInsetBackground inset={inset} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface ChoiceActionButtonProps {
  readonly label: string;
  readonly testID?: string;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly onPress: () => void;
}
export function ChoiceActionButton(
  props: ChoiceActionButtonProps
): React.JSX.Element {
  const disabled = props.disabled === true;
  return (
    <TouchableOpacity
      testID={props.testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) props.onPress();
      }}
      className={
        "min-h-12 flex-1 items-center justify-center rounded-lg px-3 " +
        (disabled
          ? "bg-slate-300 dark:bg-slate-700 "
          : props.primary
            ? "bg-nileGreen-600 "
            : "border border-border dark:border-border-dark")
      }
    >
      <Text
        className={
          "text-base font-semibold leading-6 " +
          (disabled
            ? "text-text-muted dark:text-text-muted-dark"
            : props.primary
              ? "text-white"
              : "text-text-primary dark:text-text-primary-dark")
        }
      >
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

export function ChoiceRadio({
  checked,
  disabled,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={
        "h-6 w-6 items-center justify-center rounded-full border-2 " +
        (disabled
          ? "border-slate-400 dark:border-slate-600"
          : checked
            ? "border-nileGreen-600 dark:border-nileGreen-400"
            : "border-text-secondary dark:border-text-secondary-dark")
      }
    >
      {checked ? (
        <View className="h-3 w-3 rounded-full bg-nileGreen-600 dark:bg-nileGreen-400" />
      ) : null}
    </View>
  );
}
