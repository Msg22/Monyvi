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
    account_review_choice_empty:
      "No compatible accounts. You can create a draft for this transaction.",
    account_review_choice_empty_cash:
      "No compatible Cash account for this ATM destination.",
    account_review_choice_empty_replace:
      "No compatible existing accounts. You can edit or keep this draft.",
    account_review_choice_empty_requires_currency:
      "No compatible accounts. Review the transaction currency to continue.",
    account_review_choice_create_draft: "Create account draft",
    account_review_choice_draft_title: "New account draft",
    account_review_choice_draft_name: "Account name",
    account_review_choice_draft_type: "Account type",
    account_review_choice_draft_choose_type: "Choose account type",
    account_review_choice_draft_currency: "Currency",
    account_review_choice_draft_save_note:
      "The account is created only when you save this selected transaction.",
    account_review_choice_confirm_draft: "Confirm draft",
    account_review_choice_edit_draft: "Edit draft",
    account_review_choice_keep_draft: "Keep this draft",
    account_review_choice_confirm_currency_title:
      "Confirm account and currency",
    account_review_choice_confirm_account: "Account:",
    account_review_choice_previous_currency: "Previous currency:",
    account_review_choice_currency_not_confirmed: "Not confirmed",
    account_review_choice_no_conversion:
      "The amount stays the same number. This changes its currency without conversion.",
    account_review_choice_back: "Back",
    account_review_choice_use_account_currency: "Use account and currency",
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
    account_review_choice_empty:
      "لا توجد حسابات مناسبة. يمكنك إنشاء مسودة لهذا التعامل.",
    account_review_choice_empty_cash:
      "لا يوجد حساب كاش مناسب لاستقبال السحب من ماكينة الصراف.",
    account_review_choice_empty_replace:
      "لا توجد حسابات موجودة مناسبة. يمكنك تعديل المسودة أو الاحتفاظ بها.",
    account_review_choice_empty_requires_currency:
      "لا توجد حسابات مناسبة. راجع عملة المعاملة للمتابعة.",
    account_review_choice_create_draft: "إنشاء مسودة حساب",
    account_review_choice_draft_title: "مسودة حساب جديد",
    account_review_choice_draft_name: "اسم الحساب",
    account_review_choice_draft_type: "نوع الحساب",
    account_review_choice_draft_choose_type: "اختر نوع الحساب",
    account_review_choice_draft_currency: "العملة",
    account_review_choice_draft_save_note:
      "سيُنشأ الحساب فقط عند حفظ هذه المعاملة بعد تحديدها.",
    account_review_choice_confirm_draft: "تأكيد المسودة",
    account_review_choice_edit_draft: "تعديل المسودة",
    account_review_choice_keep_draft: "الاحتفاظ بالمسودة",
    account_review_choice_confirm_currency_title: "تأكيد الحساب والعملة",
    account_review_choice_confirm_account: "الحساب:",
    account_review_choice_previous_currency: "العملة السابقة:",
    account_review_choice_currency_not_confirmed: "لم تُؤكد",
    account_review_choice_no_conversion:
      "سيظل المبلغ بنفس الرقم، وستتغير العملة دون تحويل.",
    account_review_choice_back: "رجوع",
    account_review_choice_use_account_currency: "استخدام الحساب والعملة",
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
        className="h-11 w-11 shrink-0 items-center justify-center"
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
      className="w-full min-h-0 shrink overflow-hidden rounded-t-[32px] border-t border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
      style={{ maxHeight }}
    >
      <ReviewSheetHandle />
      <ScrollView
        className="min-h-0 shrink"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-3"
      >
        <View className="w-full gap-3">
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
        "min-h-12 min-w-11 flex-1 items-center justify-center rounded-lg px-3 " +
        (disabled
          ? "bg-slate-300 dark:bg-slate-700 "
          : props.primary
            ? "bg-nileGreen-600 "
            : "border border-border dark:border-border-dark")
      }
    >
      <Text
        className={
          "min-w-0 max-w-full shrink text-center text-base font-semibold leading-6 " +
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
