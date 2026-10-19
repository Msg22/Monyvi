/**
 * #395 T038 B1 R1-03/R1-12/R3-13: controlled account-choice presentation.
 * Parent owns eligible candidates, selection, row/group command and persistence.
 */
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import { t } from "i18next";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { TextField } from "@/components/ui/TextField";
import type { AccountReviewCommand } from "@monyvi/logic";
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
  readonly currencyCode?: string;
  readonly accessibilityLabel: string;
  readonly isEligible: boolean;
  readonly iconName?:
    | "business-outline"
    | "cash-outline"
    | "wallet-outline"
    | "help-circle-outline";
}

type ManualDraftIdentity = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>["identity"];

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
  readonly explicitCurrencyChoice?: {
    readonly previousConfirmedCurrency: string | null;
  };
  readonly isCashDestination?: boolean;
  readonly onEditExistingDraft?: () => void;
  readonly draftCreation?: {
    readonly lockedCurrencyLabel: string;
    readonly typeOptions: ReadonlyArray<{
      readonly id: ManualDraftIdentity["type"];
      readonly label: string;
    }>;
    readonly onSubmit: (identity: ManualDraftIdentity) => void;
  };
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
      <Ionicons
        name={props.option.iconName ?? "help-circle-outline"}
        size={22}
        color={palette.slate[500]}
      />
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
        {choiceCopy(
          source.onEditExistingDraft
            ? "account_review_choice_empty_replace"
            : source.draftCreation
              ? "account_review_choice_empty"
              : source.isCashDestination
                ? "account_review_choice_empty_cash"
                : "account_review_choice_empty_requires_currency",
          language
        )}
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
  onStartDraft,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
  readonly onStartDraft: () => void;
}): React.JSX.Element {
  const rtl = language === "ar";
  const eligibleCount = source.candidateOptions.filter(
    (option) => option.isEligible
  ).length;
  return (
    <View className="gap-3">
      {source.scopeDisclosure.trim().length > 0 ? (
        <Text
          className={
            "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {source.scopeDisclosure}
        </Text>
      ) : null}
      {eligibleCount > 0 ? (
        <Text
          className={
            "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {accountMatchCopy(eligibleCount, language)}
        </Text>
      ) : null}
      <AccountCandidateList source={source} language={language} />
      {source.draftCreation && eligibleCount > 0 ? (
        <TouchableOpacity
          testID="account-review-create-draft"
          accessible
          accessibilityRole="button"
          accessibilityLabel={choiceCopy(
            "account_review_choice_create_draft",
            language
          )}
          disabled={source.isBusy}
          accessibilityState={{ disabled: source.isBusy }}
          onPress={onStartDraft}
          className="min-h-12 items-center justify-center rounded-lg border border-border p-3 dark:border-border-dark"
        >
          <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {choiceCopy("account_review_choice_create_draft", language)}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function AccountChoiceFooter({
  source,
  language,
  onStartDraft,
  onUseAction,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
  readonly onStartDraft: () => void;
  readonly onUseAction: () => void;
}): React.JSX.Element {
  const selected = source.candidateOptions.find(
    (item) => item.id === source.selectedCandidateId && item.isEligible
  );
  const disabled =
    !source.canUseSelection || source.isBusy || selected === undefined;
  const empty = !source.candidateOptions.some((item) => item.isEligible);
  return (
    <View
      className={
        "flex-row gap-3 border-t border-border px-5 pt-3 dark:border-border-dark " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      <ChoiceActionButton
        testID="account-review-account-cancel"
        label={choiceCopy(
          empty && source.onEditExistingDraft
            ? "account_review_choice_keep_draft"
            : "account_review_choice_cancel",
          language
        )}
        onPress={source.onClose}
      />
      {empty ? (
        source.draftCreation ? (
          <ChoiceActionButton
            testID="account-review-create-draft"
            label={choiceCopy("account_review_choice_create_draft", language)}
            disabled={source.isBusy}
            primary
            onPress={onStartDraft}
          />
        ) : source.onEditExistingDraft ? (
          <ChoiceActionButton
            testID="account-review-edit-existing-draft"
            label={choiceCopy("account_review_choice_edit_draft", language)}
            disabled={source.isBusy}
            primary
            onPress={source.onEditExistingDraft}
          />
        ) : null
      ) : (
        <ChoiceActionButton
          testID="account-review-account-use"
          label={choiceCopy("account_review_choice_use_account", language)}
          primary
          disabled={disabled}
          onPress={() => {
            if (!disabled) onUseAction();
          }}
        />
      )}
    </View>
  );
}

/** Same reviewed name, type and fixed-currency fields as the suggested editor. */
function AccountCurrencyConfirmation({
  source,
  language,
  onBack,
}: {
  readonly source: AccountChoiceSheetProps;
  readonly language: ChoiceLanguage;
  readonly onBack: () => void;
}): React.JSX.Element {
  const selected = source.candidateOptions.find(
    (option) => option.id === source.selectedCandidateId && option.isEligible
  );
  const currentCode = source.explicitCurrencyChoice?.previousConfirmedCurrency;
  const newCode = selected?.currencyCode;
  const canConfirm = !!selected && !!newCode && !source.isBusy;
  const detail = (label: string, value: string): React.JSX.Element => (
    <View
      className={
        "items-start gap-2 " +
        (language === "ar" ? "flex-row-reverse" : "flex-row")
      }
    >
      <Text
        className={
          "max-w-[45%] shrink-0 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
          (language === "ar" ? "text-right" : "text-left")
        }
      >
        {label}
      </Text>
      <Text
        className={
          "min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark " +
          (language === "ar" ? "text-right" : "text-left")
        }
      >
        {displayIdentity(value, language)}
      </Text>
    </View>
  );
  return (
    <View className="gap-4">
      <Text
        testID="account-review-confirm-account-currency"
        accessibilityRole="header"
        className="text-xl font-bold text-text-primary dark:text-text-primary-dark"
      >
        {choiceCopy("account_review_choice_confirm_currency_title", language)}
      </Text>
      {detail(
        choiceCopy("account_review_choice_confirm_account", language),
        selected?.displayName ?? ""
      )}
      {detail(
        choiceCopy("account_review_choice_draft_currency", language),
        newCode ?? ""
      )}
      {detail(
        choiceCopy("account_review_choice_previous_currency", language),
        currentCode ??
          choiceCopy("account_review_choice_currency_not_confirmed", language)
      )}
      <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
        {choiceCopy("account_review_choice_no_conversion", language)}
      </Text>
      <View
        className={
          "flex-row gap-3 border-t border-border pt-3 dark:border-border-dark " +
          (language === "ar" ? "flex-row-reverse" : "")
        }
      >
        <ChoiceActionButton
          label={choiceCopy("account_review_choice_back", language)}
          testID="account-review-confirm-account-back"
          onPress={onBack}
        />
        <ChoiceActionButton
          label={choiceCopy(
            "account_review_choice_use_account_currency",
            language
          )}
          testID="account-review-confirm-account-use"
          primary
          disabled={!canConfirm}
          onPress={source.onUseSelected}
        />
      </View>
    </View>
  );
}

function AccountDraftFields({
  name,
  onNameChange,
  typeOptionId,
  onTypeChange,
  isTypeExpanded,
  onToggleType,
  draft,
  isBusy,
  language,
}: {
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly typeOptionId: ManualDraftIdentity["type"] | null;
  readonly onTypeChange: (value: ManualDraftIdentity["type"]) => void;
  readonly isTypeExpanded: boolean;
  readonly onToggleType: () => void;
  readonly draft: NonNullable<AccountChoiceSheetProps["draftCreation"]>;
  readonly isBusy: boolean;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  const chosen = draft.typeOptions.find((option) => option.id === typeOptionId);
  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-text-primary dark:text-text-primary-dark">
        {choiceCopy("account_review_choice_draft_title", language)}
      </Text>
      <TextField
        testID="account-review-manual-draft-name"
        label={choiceCopy("account_review_choice_draft_name", language)}
        required
        variant="outlined"
        containerClassName="mb-0"
        className="min-h-12"
        value={name}
        editable={!isBusy}
        autoCapitalize="words"
        returnKeyType="done"
        accessibilityLabel={choiceCopy(
          "account_review_choice_draft_name",
          language
        )}
        onChangeText={onNameChange}
        style={{ writingDirection: rtl ? "rtl" : "ltr" }}
      />
      <View className="gap-2">
        <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
          {choiceCopy("account_review_choice_draft_type", language)}
          <Text className="text-red-500">{" *"}</Text>
        </Text>
        <TouchableOpacity
          testID="account-review-manual-draft-type"
          accessible
          accessibilityRole="button"
          accessibilityState={{ expanded: isTypeExpanded, disabled: isBusy }}
          disabled={isBusy}
          onPress={onToggleType}
          className={
            (rtl ? "flex-row-reverse " : "flex-row ") +
            "min-h-12 items-center justify-between rounded-lg border border-border px-3 dark:border-border-dark"
          }
        >
          <Text
            className={
              "min-w-0 flex-1 text-base leading-6 text-text-primary dark:text-text-primary-dark " +
              (rtl ? "text-right" : "text-left")
            }
          >
            {chosen?.label ??
              choiceCopy("account_review_choice_draft_choose_type", language)}
          </Text>
          <View className="h-5 w-5 shrink-0 items-center justify-center">
            <Ionicons
              name="chevron-down-outline"
              size={20}
              color={palette.slate[500]}
            />
          </View>
        </TouchableOpacity>
        {isTypeExpanded && !isBusy ? (
          <View className="gap-1 rounded-lg border border-border p-1 dark:border-border-dark">
            {draft.typeOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                testID="account-review-manual-draft-type-option"
                accessible
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: option.id === typeOptionId }}
                onPress={() => onTypeChange(option.id)}
                className="min-h-11 justify-center rounded-md px-3"
              >
                <Text className="text-base text-text-primary dark:text-text-primary-dark">
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
          {choiceCopy("account_review_choice_draft_currency", language)}
        </Text>
        <View
          testID="account-review-manual-draft-currency"
          accessible
          accessibilityRole="text"
          accessibilityState={{ disabled: true }}
          className={
            (rtl ? "flex-row-reverse " : "flex-row ") +
            "min-h-12 items-center justify-between rounded-lg border border-border bg-slate-100 px-3 dark:border-border-dark dark:bg-slate-800"
          }
        >
          <Text
            className={
              "min-w-0 flex-1 text-base leading-6 text-text-secondary dark:text-text-secondary-dark " +
              (rtl ? "text-right" : "text-left")
            }
          >
            {displayIdentity(draft.lockedCurrencyLabel, language)}
          </Text>
          <View className="h-5 w-5 shrink-0 items-center justify-center">
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={palette.slate[500]}
            />
          </View>
        </View>
      </View>
      <Text className="text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
        {choiceCopy("account_review_choice_draft_save_note", language)}
      </Text>
    </View>
  );
}

export function AccountChoiceSheet(
  props: AccountChoiceSheetProps
): React.JSX.Element | null {
  const language = useChoiceLanguage();
  const [editingDraft, setEditingDraft] = useState(false);
  const [confirmingCurrency, setConfirmingCurrency] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<
    ManualDraftIdentity["type"] | null
  >(null);
  const [typeExpanded, setTypeExpanded] = useState(false);
  useEffect(() => {
    if (props.visible) return;
    setEditingDraft(false);
    setConfirmingCurrency(false);
    setDraftName("");
    setDraftType(null);
    setTypeExpanded(false);
  }, [props.visible]);
  if (!props.visible) return null;
  const submit = (): void => {
    if (props.isBusy || !props.draftCreation || !draftName.trim() || !draftType)
      return;
    props.draftCreation.onSubmit({ name: draftName.trim(), type: draftType });
  };
  const cancelDraft = (): void => {
    if (props.isBusy) return;
    setEditingDraft(false);
    setDraftName("");
    setDraftType(null);
    setTypeExpanded(false);
  };
  const footer = confirmingCurrency ? null : editingDraft ? (
    <View
      className={
        "flex-row gap-3 border-t border-border px-5 pt-3 dark:border-border-dark " +
        (language === "ar" ? "flex-row-reverse" : "")
      }
    >
      <ChoiceActionButton
        testID="account-review-manual-draft-cancel"
        label={choiceCopy("account_review_choice_cancel", language)}
        disabled={props.isBusy}
        onPress={cancelDraft}
      />
      <ChoiceActionButton
        testID="account-review-manual-draft-submit"
        label={choiceCopy("account_review_choice_confirm_draft", language)}
        primary
        disabled={props.isBusy || !draftName.trim() || !draftType}
        onPress={submit}
      />
    </View>
  ) : (
    <AccountChoiceFooter
      source={props}
      language={language}
      onStartDraft={() => setEditingDraft(true)}
      onUseAction={() => {
        if (props.explicitCurrencyChoice) setConfirmingCurrency(true);
        else props.onUseSelected();
      }}
    />
  );
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
      footer={footer}
    >
      {confirmingCurrency && props.explicitCurrencyChoice ? (
        <AccountCurrencyConfirmation
          source={props}
          language={language}
          onBack={() => setConfirmingCurrency(false)}
        />
      ) : editingDraft && props.draftCreation ? (
        <AccountDraftFields
          name={draftName}
          onNameChange={setDraftName}
          typeOptionId={draftType}
          onTypeChange={(option) => {
            setDraftType(option);
            setTypeExpanded(false);
          }}
          isTypeExpanded={typeExpanded}
          onToggleType={() => setTypeExpanded((value) => !value)}
          draft={props.draftCreation}
          isBusy={props.isBusy}
          language={language}
        />
      ) : (
        <AccountChoices
          source={props}
          language={language}
          onStartDraft={() => setEditingDraft(true)}
        />
      )}
    </ChoiceModalFrame>
  );
}
