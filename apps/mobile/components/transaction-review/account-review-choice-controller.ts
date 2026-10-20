/** #395 Bounded canonical chooser composition; no persistence or account authority. */
import React from "react";
import { prepareAccountReviewManualSourceDraft } from "@/services/account-review-manual-draft-service";
import {
  accountReviewCommandSchema,
  type AccountReviewCommand,
  AccountReviewGroup,
  AccountReviewRow,
  AccountReviewSession,
} from "@monyvi/logic";
import type {
  AccountReviewChoiceAccount,
  UseAccountReviewInput,
} from "@/hooks/account-review-facade-state";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
} from "../../../../packages/logic/src/account-review/generated-vocabulary";
import { AccountChoiceSheet } from "./AccountChoiceSheet";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import { EditSuggestedAccountSheet } from "./EditSuggestedAccountSheet";
import {
  presentReviewAccountChoices,
  presentReviewCurrencyLabel,
  presentReviewReplaceScope,
  isReviewChoiceFresh,
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
      | { readonly kind: "edit"; readonly groupId: string }
    ) &
      ReviewChoiceStamp)
  | null;

/** Live command scope must match both the row/group revision and active actor. */
export function freshAccountReviewChoice(
  choice: ReviewChoice,
  session: AccountReviewSession | null,
  boundary: Pick<UseAccountReviewInput, "ownerId" | "sessionId" | "signal">
): ReviewChoice {
  if (
    !choice ||
    !session ||
    boundary.signal?.aborted ||
    boundary.ownerId !== session.ownerId ||
    boundary.sessionId !== session.sessionId
  )
    return null;
  const revision =
    choice.kind === "row"
      ? (session.rows.find((row) => row.rowId === choice.rowId)?.revision ??
        null)
      : (session.groups.find((group) => group.groupId === choice.groupId)
          ?.revision ?? null);
  return isReviewChoiceFresh(choice, session, revision) ? choice : null;
}

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

type ManualDraftCommand = Extract<
  AccountReviewCommand,
  { kind: "create_row_account_draft" }
>;
type ManualDraftIdentity = ManualDraftCommand["identity"];
type DraftCurrency = NonNullable<ManualDraftCommand["currency"]>;

export interface RenderAccountReviewChoicesInput {
  readonly activeChoice: ReviewChoice;
  readonly currentRow: AccountReviewRow | null;
  readonly currentGroup: AccountReviewGroup | null;
  readonly source: AccountReviewSession["source"];
  readonly candidates: readonly AccountReviewChoiceAccount[];
  readonly selectedCandidateId: string | null;
  readonly canCreateDraft: boolean;
  readonly busy: boolean;
  readonly reviewFeedback?: ReviewFeedbackBoundary;
  readonly language: ReviewDisplayLanguage;
  readonly tTransactions: (key: string) => string;
  readonly tAccounts: (key: string) => string;
  readonly onCandidate: (id: string) => void;
  readonly onUseAccount: () => void;
  readonly onCreateDraft: (
    identity: ManualDraftIdentity & { readonly currency: DraftCurrency }
  ) => void;
  readonly onEditExistingDraft: () => void;
  readonly onClose: () => void;
  readonly onEditGroup: (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }) => void;
  readonly onReplaceEditingGroup: () => void;
}

/** Dispatch a scoped command, with only sanitized feedback at its surface. */
export async function dispatchReviewChoiceCommand(input: {
  readonly command: unknown;
  readonly surface: "page" | "modal";
  readonly signal?: AbortSignal;
  readonly feedback: ReviewFeedbackBoundary;
  readonly dispatch: (
    command: AccountReviewCommand
  ) => Promise<{ readonly reasonCodes: readonly string[] }>;
}): Promise<boolean> {
  try {
    const checked = accountReviewCommandSchema.parse(input.command);
    const outcome = await input.dispatch(checked);
    if (input.signal?.aborted) return false;
    if (outcome.reasonCodes.length > 0) {
      input.feedback.reportFailure({
        stage: "command",
        surface: input.surface,
        reasonCodes: outcome.reasonCodes,
      });
      return false;
    }
    return true;
  } catch (error) {
    if (!input.signal?.aborted)
      input.feedback.reportFailure({
        stage: "command",
        surface: input.surface,
        error,
      });
    return false;
  }
}

/** Construct the existing atomic owned account-and-currency row command. */
export function makeExplicitRowAccountCurrencyCommand(input: {
  readonly scope: Pick<
    AccountReviewCommand,
    | "ownerId"
    | "sessionId"
    | "expectedReviewRevision"
    | "expectedOperationGeneration"
  >;
  readonly row: AccountReviewRow;
  readonly role: "source" | "destination";
  readonly account: AccountReviewChoiceAccount;
}): AccountReviewCommand {
  const { account, row, scope, role } = input;
  return accountReviewCommandSchema.parse({
    ...scope,
    kind: "confirm_row_account_and_currency",
    rowId: row.rowId,
    expectedRowRevision: row.revision,
    role,
    accountId: account.id,
    acknowledgedCurrency: account.currency,
    expectedAccountIdentity: {
      name: account.name,
      type: account.type,
      currency: account.currency,
      institutionId: account.institutionId,
      providerDisplayName: account.providerDisplayName,
      cardLast4: account.cardLast4,
    },
  });
}

/** No intermediate currency state: prepare and dispatch one guarded draft. */
export async function submitPreparedManualReviewDraft(input: {
  readonly session: AccountReviewSession;
  readonly row: AccountReviewRow;
  readonly scope: Pick<
    AccountReviewCommand,
    | "ownerId"
    | "sessionId"
    | "expectedReviewRevision"
    | "expectedOperationGeneration"
  >;
  readonly role: "source" | "destination";
  readonly value: ManualDraftIdentity & { readonly currency: DraftCurrency };
  readonly signal?: AbortSignal;
  readonly current: () => boolean;
  readonly dispatch: (
    command: AccountReviewCommand
  ) => Promise<{ readonly reasonCodes: readonly string[] }>;
}): Promise<
  | { readonly status: "accepted" | "cancelled" }
  | { readonly status: "rejected"; readonly reasonCodes: readonly string[] }
> {
  const identity = { name: input.value.name, type: input.value.type };
  const manualDraft = await prepareAccountReviewManualSourceDraft({
    session: input.session,
    row: input.row,
    role: input.role,
    identity,
    currency: input.value.currency,
  });
  if (input.signal?.aborted || !input.current()) return { status: "cancelled" };
  const command = accountReviewCommandSchema.parse({
    ...input.scope,
    kind: "create_row_account_draft",
    rowId: input.row.rowId,
    expectedRowRevision: input.row.revision,
    role: input.role,
    identity,
    currency: input.value.currency,
    manualDraft,
  });
  const result = await input.dispatch(command);
  return result.reasonCodes.length > 0
    ? { status: "rejected", reasonCodes: result.reasonCodes }
    : { status: "accepted" };
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
    rowChoice !== null && p.currentRow !== null && p.canCreateDraft;
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
        canDraft && p.currentRow
          ? {
              initialCurrency:
                p.currentRow.currency.state === "known"
                  ? p.currentRow.currency.code
                  : null,
              lockedCurrencyLabel:
                p.currentRow.currency.state === "known"
                  ? presentReviewCurrencyLabel(
                      p.currentRow.currency.code,
                      p.language
                    )
                  : "",
              currencyOptions: ACCOUNT_REVIEW_CURRENCIES.filter(
                (code) =>
                  !p.candidates.some((account) => account.currency === code)
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
      reviewFeedback: p.reviewFeedback,
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
          reviewFeedback: p.reviewFeedback,
          onSubmit: p.onEditGroup,
          onReplace: p.onReplaceEditingGroup,
          onCancel: p.onClose,
        })
      : null
  );
}
