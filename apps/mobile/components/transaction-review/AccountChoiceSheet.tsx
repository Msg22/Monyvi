/**
 * #395 T038 B1 R1-03/R1-12/R3-13: controlled account-choice presentation.
 * Parent owns eligible candidates, selection, row/group command and persistence.
 */
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { t } from "i18next";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { displayIdentity } from "./shared-account-presentation";
import {
  ChoiceActionButton,
  ChoiceModalFrame,
  ChoiceRadio,
  choiceCopy,
  useChoiceLanguage,
  type ChoiceLanguage,
} from "./account-review-choice-presentation";

export interface AccountChoiceCandidateView {
  readonly id: string;
  readonly displayName: string;
  readonly identityDetails: string;
  readonly accessibilityLabel: string;
  readonly isEligible: boolean;
}

export interface AccountChoiceSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly contextSubtitle?: string;
  readonly scopeDisclosure: string;
  readonly candidateOptions: readonly AccountChoiceCandidateView[];
  readonly selectedCandidateId: string | null;
  readonly canUseSelection: boolean;
  readonly isBusy: boolean;
  readonly onSelectCandidate: (id: string) => void;
  readonly onUseSelected: () => void;
  readonly onClose: () => void;
}

interface AccountOptionProps {
  readonly option: AccountChoiceCandidateView;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly language: ChoiceLanguage;
  readonly onPress: () => void;
}

/** Paint selected/normal backgrounds on View, never the interactive surface. */
function AccountOptionBackground({
  selected,
}: {
  readonly selected: boolean;
}): React.JSX.Element {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className={
        "absolute inset-0 rounded-xl " +
        (selected
          ? "bg-nileGreen-50 dark:bg-nileGreen-900/20"
          : "bg-surface dark:bg-surface-dark")
      }
    />
  );
}

function AccountOption(props: AccountOptionProps): React.JSX.Element {
  const rtl = props.language === "ar";
  return (
    <TouchableOpacity
      testID="account-review-account-option"
      accessible
      accessibilityRole="radio"
      accessibilityLabel={props.option.accessibilityLabel}
      accessibilityState={{
        selected: props.selected,
        disabled: props.disabled,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      activeOpacity={0.8}
      className={
        "relative min-h-[76px] items-center gap-3 overflow-hidden rounded-xl border p-3 " +
        (rtl ? "flex-row-reverse " : "flex-row ") +
        (props.selected
          ? "border-nileGreen-600 dark:border-nileGreen-400"
          : "border-border dark:border-border-dark")
      }
    >
      <AccountOptionBackground selected={props.selected} />
      <Ionicons name="business-outline" size={24} color={palette.slate[400]} />
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            "text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {props.option.displayName}
        </Text>
        <Text
          className={
            "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {displayIdentity(props.option.identityDetails, props.language)}
        </Text>
      </View>
      <ChoiceRadio checked={props.selected} disabled={props.disabled} />
    </TouchableOpacity>
  );
}

function accountMatchCopy(count: number, language: ChoiceLanguage): string {
  const number =
    language === "ar"
      ? new Intl.NumberFormat("ar-EG").format(count)
      : String(count);
  const fallback =
    language === "ar"
      ? count === 1
        ? "يوجد حساب واحد يطابق هذه المعاملة."
        : count === 2
          ? "يوجد حسابان يطابقان هذه المعاملة."
          : "هناك " + number + " حسابات تطابق هذه المعاملة."
      : number +
        (count === 1
          ? " account matches this transaction."
          : " accounts match this transaction.");
  return t("account_review_choice_match_count", {
    ns: "transactions",
    lng: language,
    count,
    defaultValue: fallback,
  });
}

/** Keep the exact empty/list host sibling sequence without a wrapper View. */
function AccountCandidateList({
  source,
  language,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  if (source.candidateOptions.length === 0) {
    return (
      <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
        {choiceCopy("account_review_choice_empty", language)}
      </Text>
    );
  }
  return (
    <>
      {source.candidateOptions.map((option) => (
        <AccountOption
          key={option.id}
          option={option}
          language={language}
          selected={source.selectedCandidateId === option.id}
          disabled={source.isBusy || !option.isEligible}
          onPress={() => {
            if (!source.isBusy && option.isEligible)
              source.onSelectCandidate(option.id);
          }}
        />
      ))}
    </>
  );
}

function AccountChoices({
  source,
  language,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  const eligibleCount = source.candidateOptions.filter(
    (option) => option.isEligible
  ).length;
  return (
    <View className="gap-3">
      <Text
        className={
          "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {source.scopeDisclosure}
      </Text>
      <Text
        className={
          "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {accountMatchCopy(eligibleCount, language)}
      </Text>
      <AccountCandidateList source={source} language={language} />
      {source.contextSubtitle === undefined ? (
        <Text
          className={
            "text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {choiceCopy("account_review_choice_preserve_selection", language)}
        </Text>
      ) : null}
    </View>
  );
}

function AccountChoiceFooter({
  source,
  language,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const selected = source.candidateOptions.find(
    (item) => item.id === source.selectedCandidateId && item.isEligible
  );
  const disabled =
    !source.canUseSelection || source.isBusy || selected === undefined;
  return (
    <View
      className={
        "flex-row gap-3 border-t border-border px-5 pt-3 dark:border-border-dark " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      <ChoiceActionButton
        testID="account-review-account-cancel"
        label={choiceCopy("account_review_choice_cancel", language)}
        onPress={source.onClose}
      />
      <ChoiceActionButton
        testID="account-review-account-use"
        label={choiceCopy("account_review_choice_use_account", language)}
        primary
        disabled={disabled}
        onPress={() => {
          if (!disabled) source.onUseSelected();
        }}
      />
    </View>
  );
}

export function AccountChoiceSheet(
  props: AccountChoiceSheetProps
): React.JSX.Element | null {
  const language = useChoiceLanguage();
  if (!props.visible) return null;
  return (
    <ChoiceModalFrame
      visible
      testID="account-review-account-choice-sheet"
      title={props.title}
      contextSubtitle={props.contextSubtitle}
      closeAccessibilityLabel={
        language === "ar" ? "إغلاق اختيار الحساب" : "Close account chooser"
      }
      language={language}
      onClose={props.onClose}
      footer={<AccountChoiceFooter source={props} language={language} />}
    >
      <AccountChoices source={props} language={language} />
    </ChoiceModalFrame>
  );
}
