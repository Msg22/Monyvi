/**
 * #395 T038 R1-11/R3-03: currency conflict presentation, not picker or resolver.
 * Stages one supplied candidate; Use is a separate parent-owned command.
 */
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
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

export interface CurrencyCandidateView {
  readonly code: string;
  readonly label: string;
  readonly accessibilityLabel: string;
}
export interface CurrencyConfirmationSheetProps {
  readonly visible: boolean;
  readonly contextSubtitle: string;
  readonly candidateOptions: readonly CurrencyCandidateView[];
  readonly selectedCandidateCode: string | null;
  readonly canUseSelection: boolean;
  readonly isBusy: boolean;
  readonly onSelectCandidate: (code: string) => void;
  readonly onUseSelected: () => void;
  readonly onChooseAnother: () => void;
  readonly onClose: () => void;
}

interface CurrencyOptionProps {
  readonly option: CurrencyCandidateView;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly language: ChoiceLanguage;
  readonly onPress: () => void;
}
function CurrencyOption(props: CurrencyOptionProps): React.JSX.Element {
  const rtl = props.language === "ar";
  return (
    <TouchableOpacity
      testID="account-review-currency-option"
      accessible
      accessibilityRole="radio"
      accessibilityLabel={props.option.accessibilityLabel}
      accessibilityState={{
        selected: props.selected,
        disabled: props.disabled,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={
        "min-h-[68px] items-center gap-4 border-b border-border py-3 dark:border-border-dark " +
        (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <ChoiceRadio checked={props.selected} disabled={props.disabled} />
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            "text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {props.option.label}
        </Text>
        <Text
          className={
            "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {displayIdentity(props.option.code, props.language)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** The approved Choose another action changes only the parent's mode. */
function CurrencyAlternativeAction({
  source,
  language,
}: {
  readonly source: CurrencyConfirmationSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  return (
    <TouchableOpacity
      testID="account-review-currency-another"
      accessible
      accessibilityRole="button"
      disabled={source.isBusy}
      accessibilityState={{ disabled: source.isBusy }}
      onPress={() => {
        if (!source.isBusy) source.onChooseAnother();
      }}
      className={
        "min-h-12 items-center gap-3 border-y border-border py-3 dark:border-border-dark " +
        (rtl ? "flex-row-reverse" : "flex-row")
      }
    >
      <Ionicons name="globe-outline" size={22} color={palette.nileGreen[500]} />
      <Text className="min-w-0 flex-1 text-base font-semibold leading-6 text-nileGreen-700 dark:text-nileGreen-400">
        {choiceCopy("account_review_currency_choose_another", language)}
      </Text>
    </TouchableOpacity>
  );
}

function CurrencyOptions({
  source,
  language,
}: {
  readonly source: CurrencyConfirmationSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  return (
    <View className="gap-3">
      <View>
        {source.candidateOptions.map((option) => (
          <CurrencyOption
            key={option.code}
            option={option}
            language={language}
            selected={source.selectedCandidateCode === option.code}
            disabled={source.isBusy}
            onPress={() => {
              if (!source.isBusy) source.onSelectCandidate(option.code);
            }}
          />
        ))}
      </View>
      <CurrencyAlternativeAction source={source} language={language} />
      <View
        className={
          "items-center gap-3 " + (rtl ? "flex-row-reverse" : "flex-row")
        }
      >
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={palette.slate[400]}
        />
        <Text className="min-w-0 flex-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
          {choiceCopy("account_review_currency_unselected", language)}
        </Text>
      </View>
    </View>
  );
}

function CurrencyConfirmationFooter({
  source,
  language,
}: {
  readonly source: CurrencyConfirmationSheetProps;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const chosen = source.candidateOptions.some(
    (option) => option.code === source.selectedCandidateCode
  );
  const disabled = source.isBusy || !source.canUseSelection || !chosen;
  return (
    <View
      className={
        "flex-row gap-3 border-t border-border px-5 pt-3 dark:border-border-dark " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      <ChoiceActionButton
        label={choiceCopy("account_review_choice_cancel", language)}
        testID="account-review-currency-cancel"
        onPress={source.onClose}
      />
      <ChoiceActionButton
        label={choiceCopy("account_review_choice_use_currency", language)}
        testID="account-review-currency-use"
        disabled={disabled}
        primary
        onPress={() => {
          if (!disabled) source.onUseSelected();
        }}
      />
    </View>
  );
}

export function CurrencyConfirmationSheet(
  props: CurrencyConfirmationSheetProps
): React.JSX.Element | null {
  const language = useChoiceLanguage();
  if (!props.visible) return null;
  return (
    <ChoiceModalFrame
      visible
      testID="account-review-currency-conflict-sheet"
      title={choiceCopy("account_review_currency_title", language)}
      contextSubtitle={props.contextSubtitle}
      closeAccessibilityLabel={
        language === "ar" ? "إغلاق تأكيد العملة" : "Close currency confirmation"
      }
      onClose={props.onClose}
      language={language}
      footer={<CurrencyConfirmationFooter source={props} language={language} />}
    >
      <CurrencyOptions source={props} language={language} />
    </ChoiceModalFrame>
  );
}
