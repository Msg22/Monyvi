/** #395 Bounded canonical chooser composition; no persistence or account authority. */
import React from "react";
import type {
  AccountReviewCommand,
  AccountReviewGroup,
  AccountReviewRow,
  AccountReviewSession,
} from "@monyvi/logic";
import type { AccountReviewChoiceAccount } from "@/hooks/account-review-facade-state";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
} from "../../../../packages/logic/src/account-review/generated-vocabulary";
import { currencyCode } from "../../../../packages/logic/src/account-review/schema-primitives";
import { AccountChoiceSheet } from "./AccountChoiceSheet";
import { CurrencyConfirmationSheet } from "./CurrencyConfirmationSheet";
import { EditSuggestedAccountSheet } from "./EditSuggestedAccountSheet";
import {
  presentReviewAccountChoices,
  presentReviewCurrencyLabel,
  presentReviewCurrencyOptions,
  presentReviewReplaceScope,
  presentReviewTransactionContext,
  type ReviewDisplayLanguage,
  type ReviewChoiceStamp,
} from "./shared-account-presentation";

export type ReviewChoice =
  | ((
      | {
          readonly kind: "row";
          readonly rowId: string;
          readonly role: "source" | "destination";
        }
      | { readonly kind: "replace"; readonly groupId: string }
      | {
          readonly kind: "currency" | "picker";
          readonly rowId: string;
          readonly context: string;
        }
      | { readonly kind: "edit"; readonly groupId: string }
    ) &
      ReviewChoiceStamp)
  | null;

export function reviewGroupChoiceRole(
  source: AccountReviewSession["source"],
  group: AccountReviewGroup
): "source" | "destination" {
  return source === "SMS" && group.type === "CASH" ? "destination" : "source";
}

export function preselectedOwnedAccountId(
  row: AccountReviewRow,
  role: "source" | "destination",
  candidates: readonly AccountReviewChoiceAccount[]
): string | null {
  const endpoint = role === "source" ? row.assignment : row.toAssignment;
  if (endpoint?.state !== "existing" || row.currency.state !== "known")
    return null;
  const knownCurrencyCode = row.currency.code;
  return candidates.some(
    (account) =>
      account.id === endpoint.accountId &&
      account.currency === knownCurrencyCode &&
      endpoint.currency === account.currency
  )
    ? endpoint.accountId
    : null;
}

type ManualDraftIdentity = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>["identity"];

export interface RenderAccountReviewChoicesInput {
  readonly activeChoice: ReviewChoice;
  readonly currentRow: AccountReviewRow | null;
  readonly currentGroup: AccountReviewGroup | null;
  readonly source: AccountReviewSession["source"];
  readonly candidates: readonly AccountReviewChoiceAccount[];
  readonly selectedCandidateId: string | null;
  readonly currencySelection: string | null;
  readonly canCreateDraft: boolean;
  readonly busy: boolean;
  readonly language: ReviewDisplayLanguage;
  readonly tTransactions: (key: string) => string;
  readonly tAccounts: (key: string) => string;
  readonly onCandidate: (id: string) => void;
  readonly onUseAccount: () => void;
  readonly onCreateDraft: (identity: ManualDraftIdentity) => void;
  readonly onEditExistingDraft: () => void;
  readonly onClose: () => void;
  readonly onCurrencyCandidate: (currency: string) => void;
  readonly onConfirmCurrency: (currency: string | null) => void;
  readonly onOpenCurrencyPicker: () => void;
  readonly onEditGroup: (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }) => void;
  readonly onReplaceEditingGroup: () => void;
}

/** Identical B1 sheets/picker, with one role-specific chooser and no fake IDs. */
export function renderAccountReviewChoiceSheets(
  p: RenderAccountReviewChoicesInput
): React.ReactNode {
  const rowChoice = p.activeChoice?.kind === "row" ? p.activeChoice : null;
  const replacing =
    p.activeChoice?.kind === "replace" && p.currentGroup !== null;
  const isDestination =
    rowChoice?.role === "destination" ||
    (replacing &&
      p.currentGroup !== null &&
      reviewGroupChoiceRole(p.source, p.currentGroup) === "destination");
  const options = presentReviewAccountChoices(p.candidates, p.language);
  const selectionIsEligible =
    p.selectedCandidateId !== null &&
    p.candidates.some((account) => account.id === p.selectedCandidateId);
  const allowedTypes = ACCOUNT_REVIEW_ACCOUNT_TYPES.filter((type) =>
    isDestination ? type === "CASH" : p.source === "VOICE" || type !== "CASH"
  ).map((type) => ({
    id: type,
    label: p.tAccounts("type_" + type.toLowerCase()),
  }));
  const canDraft =
    rowChoice !== null &&
    p.currentRow?.currency.state === "known" &&
    p.canCreateDraft;
  const checkedCurrency = currencyCode.safeParse(p.currencySelection);
  const currencyOptions = presentReviewCurrencyOptions(
    p.currentRow?.currency,
    checkedCurrency.success ? checkedCurrency.data : null
  );
  const group = p.activeChoice?.kind === "edit" ? p.currentGroup : null;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(AccountChoiceSheet, {
      visible: rowChoice !== null || replacing,
      title:
        rowChoice !== null &&
        p.currentRow?.source === "SMS" &&
        p.currentRow.transaction.isAtmWithdrawal
          ? p.tTransactions(isDestination ? "to_account" : "from_account")
          : p.tTransactions("account_review_issue_account"),
      contextSubtitle:
        p.currentGroup?.name ??
        (p.currentRow
          ? presentReviewTransactionContext(
              p.currentRow.transaction,
              p.language
            )
          : undefined),
      scopeDisclosure:
        replacing && p.currentGroup
          ? presentReviewReplaceScope(
              p.currentGroup.name,
              p.currentGroup.linkedRowIds.length,
              p.language
            )
          : "",
      candidateOptions: options,
      selectedCandidateId: p.selectedCandidateId,
      canUseSelection: selectionIsEligible,
      isBusy: p.busy,
      explicitCurrencyChoice: rowChoice
        ? {
            previousConfirmedCurrency:
              p.currentRow?.currency.state === "known"
                ? p.currentRow.currency.code
                : null,
          }
        : undefined,
      isCashDestination: isDestination,
      draftCreation:
        canDraft && p.currentRow?.currency.state === "known"
          ? {
              lockedCurrencyLabel: presentReviewCurrencyLabel(
                p.currentRow.currency.code,
                p.language
              ),
              typeOptions: allowedTypes,
              onSubmit: p.onCreateDraft,
            }
          : undefined,
      onEditExistingDraft:
        replacing && p.candidates.length === 0
          ? p.onEditExistingDraft
          : undefined,
      onSelectCandidate: p.onCandidate,
      onUseSelected: p.onUseAccount,
      onClose: p.onClose,
    }),
    React.createElement(CurrencyConfirmationSheet, {
      visible: p.activeChoice?.kind === "currency",
      contextSubtitle:
        p.activeChoice?.kind === "currency" ? p.activeChoice.context : "",
      candidateOptions: currencyOptions.map((code) => ({
        code,
        label: presentReviewCurrencyLabel(code, p.language),
        accessibilityLabel:
          presentReviewCurrencyLabel(code, p.language) + ", " + code,
      })),
      selectedCandidateCode: p.currencySelection,
      canUseSelection: checkedCurrency.success,
      isBusy: p.busy,
      onSelectCandidate: p.onCurrencyCandidate,
      onUseSelected: () => p.onConfirmCurrency(p.currencySelection),
      onChooseAnother: p.onOpenCurrencyPicker,
      onClose: p.onClose,
    }),
    React.createElement(CurrencyPicker, {
      visible: p.activeChoice?.kind === "picker",
      selectedCurrency: checkedCurrency.success ? checkedCurrency.data : null,
      allowedCurrencies: ACCOUNT_REVIEW_CURRENCIES,
      contextSubtitle:
        p.activeChoice?.kind === "picker" ? p.activeChoice.context : undefined,
      onSelect: p.onConfirmCurrency,
      onClose: p.onClose,
    }),
    group !== null
      ? React.createElement(EditSuggestedAccountSheet, {
          visible: true,
          groupId: group.groupId,
          groupName: group.name,
          currentTypeOptionId: group.type ?? "",
          allowedTypeOptions: ACCOUNT_REVIEW_ACCOUNT_TYPES.filter((type) =>
            p.source === "SMS"
              ? reviewGroupChoiceRole(p.source, group) === "destination"
                ? type === "CASH"
                : type !== "CASH"
              : true
          ).map((type) => ({
            id: type,
            label: p.tAccounts("type_" + type.toLowerCase()),
          })),
          lockedCurrencyLabel: group.currency,
          identitySummary:
            group.providerDisplayName ?? group.institutionId ?? "",
          linkedCount: group.linkedRowIds.length,
          canSubmit: !p.busy && group.status !== "removed",
          isBusy: p.busy,
          validationMessage: null,
          onSubmit: p.onEditGroup,
          onReplace: p.onReplaceEditingGroup,
          onCancel: p.onClose,
        })
      : null
  );
}
