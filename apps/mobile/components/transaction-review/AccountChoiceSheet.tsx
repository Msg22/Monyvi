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
import { DropdownSelectedOptionBackground } from "@/components/ui/Dropdown";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { ReviewCurrencyDropdown } from "./ReviewCurrencyDropdown";
import { currencyCode } from "../../../../packages/logic/src/account-review/schema-primitives";
import type { AccountReviewCommand } from "@monyvi/logic";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import { displayIdentity } from "./shared-account-presentation";
import {
  ChoiceActionButton,
  ChoiceModalFrame,
  ChoiceRadio,
  choiceCopy,
  useChoiceLanguage,
  useChoiceFocusedInputReveal,
  type ChoiceLanguage,
} from "./account-review-choice-presentation";

/** Presentation-only context for the live rows affected by a group-wide choice. */
export interface AccountChoiceLinkedRow {
  readonly rowId: string;
  readonly title: string;
  readonly amountLabel: string;
}
export const AccountChoiceLinkedRowsContext = React.createContext<
  readonly AccountChoiceLinkedRow[]
>([]);

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

type ManualDraftCommand = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>;
type ManualDraftIdentity = ManualDraftCommand["identity"];
type DraftCurrency = NonNullable<ManualDraftCommand["currency"]>;

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
  readonly reviewFeedback?: ReviewFeedbackBoundary;
  readonly explicitCurrencyChoice?: {
    readonly previousConfirmedCurrency: string | null;
  };
  readonly isCashDestination?: boolean;
  readonly onEditExistingDraft?: () => void;
  readonly draftCreation?: {
    /** Existing row currency, or null when the owner has not confirmed one. */
    readonly initialCurrency?: string | null;
    /** Generated supported currencies, never provider-derived suggestions. */
    readonly currencyOptions?: readonly string[];
    readonly lockedCurrencyLabel: string;
    readonly typeOptions: ReadonlyArray<{
      readonly id: ManualDraftIdentity["type"];
      readonly label: string;
    }>;
    readonly onSubmit: (
      identity: ManualDraftIdentity & { readonly currency: DraftCurrency }
    ) => void;
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
      <View className="h-7 w-7 shrink-0 items-center justify-center">
        <Ionicons
          name={props.option.iconName ?? "help-circle-outline"}
          size={22}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            "text-base font-semibold leading-6 text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {props.option.displayName}
        </Text>
        {props.option.identityDetails.length > 0 ? (
          <Text
            className={
              "text-sm leading-5 text-text-secondary dark:text-text-secondary-dark " +
              (rtl ? "text-right" : "text-left")
            }
          >
            {displayIdentity(props.option.identityDetails, props.language)}
          </Text>
        ) : null}
        {props.option.currencyCode ? (
          <Text
            testID="account-review-account-option-currency"
            className="self-start rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-text-primary dark:bg-slate-700 dark:text-text-primary-dark"
          >
            {props.option.currencyCode}
          </Text>
        ) : null}
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
  const linkedRows = React.useContext(AccountChoiceLinkedRowsContext);
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
      {source.scopeDisclosure.trim().length > 0 && linkedRows.length > 0 ? (
        <View
          testID="account-review-account-linked-rows"
          className="gap-1 rounded-lg bg-background px-3 py-2 dark:bg-background-dark"
        >
          {linkedRows.map((row) => (
            <View
              key={row.rowId}
              className={
                "min-w-0 flex-row flex-wrap items-start justify-between gap-2 py-1 " +
                (rtl ? "flex-row-reverse" : "")
              }
            >
              <Text
                className={
                  "min-w-0 flex-1 text-sm leading-5 text-text-primary dark:text-text-primary-dark " +
                  (rtl ? "text-right" : "text-left")
                }
              >
                {row.title}
              </Text>
              <Text className="shrink-0 text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark">
                {row.amountLabel}
              </Text>
            </View>
          ))}
        </View>
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
      {source.explicitCurrencyChoice &&
      source.candidateOptions.some(
        (option) =>
          option.id === source.selectedCandidateId &&
          option.isEligible &&
          option.currencyCode
      ) ? (
        <Text
          testID="account-review-account-currency-no-conversion"
          className="text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark"
        >
          {choiceCopy("account_review_choice_no_conversion", language)}
        </Text>
      ) : null}
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
          label={
            selected?.currencyCode
              ? t("compact_review_use_account_currency", {
                  ns: "transactions",
                  lng: language,
                  currency: selected.currencyCode,
                })
              : choiceCopy("account_review_choice_use_account", language)
          }
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

function AccountDraftFields({
  name,
  onNameChange,
  typeOptionId,
  onTypeChange,
  isTypeExpanded,
  onToggleType,
  draft,
  draftCurrency,
  onOpenCurrencyPicker,
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
  readonly draftCurrency: DraftCurrency | null;
  readonly onOpenCurrencyPicker: () => void;
  readonly isBusy: boolean;
  readonly language: ChoiceLanguage;
}): React.JSX.Element {
  const rtl = language === "ar";
  const revealFocusedInput = useChoiceFocusedInputReveal();
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
        className="min-h-12 bg-surface dark:bg-surface-dark"
        value={name}
        editable={!isBusy}
        autoCapitalize="words"
        returnKeyType="done"
        accessibilityLabel={choiceCopy(
          "account_review_choice_draft_name",
          language
        )}
        onChangeText={onNameChange}
        onFocus={(event) => {
          const target = event.nativeEvent.target;
          revealFocusedInput(typeof target === "number" ? target : null);
        }}
        onBlur={() => revealFocusedInput(null)}
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
            {draft.typeOptions.map((option) => {
              const selected = option.id === typeOptionId;
              return (
                <TouchableOpacity
                  key={option.id}
                  testID="account-review-manual-draft-type-option"
                  accessible
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onTypeChange(option.id)}
                  className={
                    (rtl ? "flex-row-reverse " : "flex-row ") +
                    "relative min-h-11 items-center justify-between overflow-hidden rounded-md px-3"
                  }
                >
                  <DropdownSelectedOptionBackground selected={selected} />
                  <Text
                    className={
                      "min-w-0 flex-1 text-base " +
                      (selected
                        ? "font-semibold text-white dark:text-white"
                        : "text-text-primary dark:text-text-primary-dark")
                    }
                  >
                    {option.label}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color="white"
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
      <ReviewCurrencyDropdown
        testID="account-review-manual-draft-currency"
        label={choiceCopy("account_review_choice_draft_currency", language)}
        value={draftCurrency}
        placeholder={choiceCopy(
          "account_review_choice_choose_currency",
          language
        )}
        disabled={isBusy}
        language={language}
        onPress={onOpenCurrencyPicker}
      />
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
  const [draftCurrency, setDraftCurrency] = useState<DraftCurrency | null>(
    null
  );
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<
    ManualDraftIdentity["type"] | null
  >(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [typeExpanded, setTypeExpanded] = useState(false);
  useEffect(() => {
    if (props.visible) return;
    setEditingDraft(false);
    setDraftCurrency(null);
    setDraftName("");
    setDraftType(null);
    setTypeExpanded(false);
    setCurrencyPickerOpen(false);
  }, [props.visible]);
  if (!props.visible) return null;
  const submit = (): void => {
    const currency = currencyCode.safeParse(draftCurrency);
    if (
      props.isBusy ||
      !props.draftCreation ||
      !draftName.trim() ||
      !draftType ||
      !currency.success
    )
      return;
    props.draftCreation.onSubmit({
      name: draftName.trim(),
      type: draftType,
      currency: currency.data,
    });
  };
  const cancelDraft = (): void => {
    if (props.isBusy) return;
    setEditingDraft(false);
    setDraftName("");
    setDraftType(null);
    setTypeExpanded(false);
    setDraftCurrency(null);
    setCurrencyPickerOpen(false);
  };
  const startDraft = (): void => {
    const initial =
      props.draftCreation?.initialCurrency ??
      props.draftCreation?.lockedCurrencyLabel;
    const checked = currencyCode.safeParse(initial);
    setDraftCurrency(checked.success ? checked.data : null);
    setEditingDraft(true);
  };
  const footer = editingDraft ? (
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
        disabled={
          props.isBusy ||
          !draftName.trim() ||
          !draftType ||
          !currencyCode.safeParse(draftCurrency).success
        }
        onPress={submit}
      />
    </View>
  ) : (
    <AccountChoiceFooter
      source={props}
      language={language}
      onStartDraft={startDraft}
      onUseAction={props.onUseSelected}
    />
  );
  return (
    <>
      <ChoiceModalFrame
        visible={!currencyPickerOpen}
        testID="account-review-account-choice-sheet"
        title={props.title}
        contextSubtitle={props.contextSubtitle}
        closeAccessibilityLabel={
          language === "ar" ? "إغلاق اختيار الحساب" : "Close account chooser"
        }
        language={language}
        onClose={props.onClose}
        footer={footer}
        reviewFeedback={props.reviewFeedback}
      >
        {editingDraft && props.draftCreation ? (
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
            draftCurrency={draftCurrency}
            onOpenCurrencyPicker={() => {
              if (!props.isBusy) setCurrencyPickerOpen(true);
            }}
            isBusy={props.isBusy}
            language={language}
          />
        ) : (
          <AccountChoices
            source={props}
            language={language}
            onStartDraft={startDraft}
          />
        )}
      </ChoiceModalFrame>
      <CurrencyPicker
        testID="account-review-manual-draft-currency-picker"
        visible={currencyPickerOpen}
        selectedCurrency={draftCurrency}
        contextSubtitle={props.contextSubtitle}
        allowedCurrencies={[
          ...(props.draftCreation?.currencyOptions ?? []),
          ...(draftCurrency === null ? [] : [draftCurrency]),
        ]}
        onSelect={(selected) => setDraftCurrency(selected)}
        onClose={() => setCurrencyPickerOpen(false)}
      />
    </>
  );
}
