/**
 * #395 T054: cohesive canonical review container extracted from the shared
 * entry to keep each review branch independently maintainable. This invokes
 * ONLY the existing review facade, never legacy per-row account/financial
 * writers, and retains the original typed CAS/save callbacks and layout.
 */
import {
  accountReviewCommandSchema,
  type AccountReviewSession,
  type AccountReviewRow,
  type AccountReviewCommand,
} from "@monyvi/logic";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
} from "../../../../packages/logic/src/account-review/generated-vocabulary";
import {
  accountType,
  currencyCode,
} from "../../../../packages/logic/src/account-review/schema-primitives";
import { useAccountReview } from "@/hooks/useAccountReview";
import { useToast } from "@/components/ui/Toast";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { AccountReviewPanel } from "./AccountReviewPanel";
import type { SharedSuggestedGroupView } from "./SharedAccountSuggestions";
import { AccountChoiceSheet } from "./AccountChoiceSheet";
import { CurrencyConfirmationSheet } from "./CurrencyConfirmationSheet";
import { EditSuggestedAccountSheet } from "./EditSuggestedAccountSheet";
import { choiceCopy } from "./account-review-choice-presentation";
import {
  presentReviewAccountChoices,
  presentReviewCurrencyOptions,
  presentReviewDefaultAccountName,
  presentReviewIssueKeys,
  reviewCopy,
  ReviewActionButton,
} from "./shared-account-presentation";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { TransactionEditModal } from "./edit-modal/TransactionEditModal";
import { getExpandedContent } from "./get-expanded-content";
import { ReviewActionBar } from "./ReviewActionBar";
import { TransactionItem } from "./TransactionItem";
import { PartialSmsResultsNotice } from "./PartialSmsResultsNotice";
import { SafeguardQaDiagnosticsPanel } from "@/components/sms-sync/SafeguardQaDiagnosticsPanel";
import type {
  TransactionReviewProps,
  AccountReviewRuntimeBoundary,
  TransactionReviewListConfig,
} from "./TransactionReview";

interface ReviewTransactionEditTarget {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly rowId: string;
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly rowRevision: string;
}
type ReviewTransactionEditPatch = Extract<
  AccountReviewCommand,
  { kind: "edit_row_transaction" }
>["patch"];

type ReviewChoice =
  | {
      readonly kind: "row";
      readonly rowId: string;
      readonly role: "source" | "destination";
    }
  | { readonly kind: "replace"; readonly groupId: string }
  | {
      readonly kind: "currency";
      readonly rowId: string;
      readonly context: string;
    }
  | { readonly kind: "edit"; readonly groupId: string }
  | null;

/**
 * One canonical facade per review. The old useTransactionReviewState and its
 * DB/account hooks exist only in LegacyTransactionReview; this branch cannot
 * invoke the original per-row financial writer.
 */
export function CanonicalAccountReview(
  props: TransactionReviewProps & {
    readonly boundary: AccountReviewRuntimeBoundary;
    readonly renderConfig: TransactionReviewListConfig;
  }
): React.JSX.Element {
  const view = useAccountReview(props.boundary.input);
  const { t: tCommon } = useTranslation("common");
  const { t: tTransactions, i18n } = useTranslation("transactions");
  const { t: tAccounts } = useTranslation("accounts");
  const language = i18n.language.startsWith("ar") ? "ar" : "en";
  const { showToast } = useToast();
  const [choice, setChoice] = useState<ReviewChoice>(null);
  const [transactionEdit, setTransactionEdit] =
    useState<ReviewTransactionEditTarget | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [currencySelection, setCurrencySelection] = useState<string | null>(
    null
  );
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showDefaultWhy, setShowDefaultWhy] = useState(false);
  const [busySave, setBusySave] = useState(false);

  const session = view.session;
  const model = view.readModel;
  const busy = view.isBusy || props.isSaving || busySave;
  useEffect(() => {
    props.boundary.onSessionChange?.(session);
  }, [props.boundary.onSessionChange, session]);

  // The retry producer finishes its owned SQLite merge before isRetrying
  // falls. Refresh the same queue only after that transition, never when the
  // button is first pressed or on a failed/foreign-owner response.
  const retryInput = props.boundary.input;
  const retryMode = retryInput.mode;
  const retryOwnerId = retryInput.ownerId;
  const retrySessionId = retryInput.sessionId;
  const retrySignal = retryInput.signal;
  const retryQueueId = retryMode === "SMS" ? retryInput.queueId : null;
  const retrying = props.partialResults?.isRetrying === true;
  const priorRetry = useRef<{
    readonly ownerId: string;
    readonly sessionId: string;
    readonly queueId: string;
    readonly retrying: boolean;
  } | null>(null);
  useEffect(() => {
    if (
      retryMode !== "SMS" ||
      !retryOwnerId ||
      !retryQueueId ||
      retrySignal?.aborted
    ) {
      priorRetry.current = null;
      return;
    }
    const previous = priorRetry.current;
    const sameQueue =
      previous !== null &&
      previous.ownerId === retryOwnerId &&
      previous.sessionId === retrySessionId &&
      previous.queueId === retryQueueId;
    priorRetry.current = {
      ownerId: retryOwnerId,
      sessionId: retrySessionId,
      queueId: retryQueueId,
      retrying,
    };
    // A partial retry can merge some rows before reporting other failures.
    // Rehydrate the owned queue after every completed attempt; unchanged
    // failures simply reload the same persisted choices.
    if (sameQueue && previous.retrying && !retrying) view.reload();
  }, [
    retryMode,
    retryOwnerId,
    retrySessionId,
    retrySignal,
    retryQueueId,
    retrying,
    view.reload,
  ]);

  const scope = session
    ? {
        ownerId: session.ownerId,
        sessionId: session.sessionId,
        expectedReviewRevision: session.revision,
        expectedOperationGeneration: session.operationGeneration,
      }
    : null;
  const rows = new Map(session?.rows.map((row) => [row.rowId, row]) ?? []);
  const groups = new Map(
    session?.groups.map((group) => [group.groupId, group]) ?? []
  );
  // Modal identity is pinned to the canonical session and row revision.
  // A changed owner, revoked facade, late edit, reload or accepted competing
  // command must not keep a stale editor/patch alive.
  const editingRow =
    transactionEdit &&
    session &&
    session.ownerId === transactionEdit.ownerId &&
    session.sessionId === transactionEdit.sessionId &&
    session.revision === transactionEdit.reviewRevision &&
    session.operationGeneration === transactionEdit.operationGeneration &&
    props.boundary.input.ownerId === transactionEdit.ownerId &&
    props.boundary.input.sessionId === transactionEdit.sessionId &&
    !props.boundary.input.signal?.aborted
      ? (session.rows.find(
          (row) =>
            row.rowId === transactionEdit.rowId &&
            row.revision === transactionEdit.rowRevision
        ) ?? null)
      : null;
  useEffect(() => {
    if (transactionEdit !== null && editingRow === null)
      setTransactionEdit(null);
  }, [transactionEdit, editingRow]);
  const currentRow =
    choice && (choice.kind === "row" || choice.kind === "currency")
      ? (rows.get(choice.rowId) ?? null)
      : null;
  const currentGroup =
    choice && (choice.kind === "replace" || choice.kind === "edit")
      ? (groups.get(choice.groupId) ?? null)
      : null;

  // Never expose internal reason codes or exception messages in the UI.
  const showCommandFailure = (type: "warning" | "error"): void => {
    if (props.boundary.input.signal?.aborted) return;
    showToast({
      type,
      title: tTransactions("update_error"),
      message: tTransactions("voice_error_default"),
    });
  };
  /** Every command is schema-checked; the reducer and service decide policy. */
  const send = (command: unknown): void => {
    if (!session || !model || busy) return;
    try {
      const validated = accountReviewCommandSchema.parse(command);
      void view
        .dispatch(validated)
        .then((result) => {
          if (result.reasonCodes.length > 0) showCommandFailure("warning");
        })
        .catch(() => showCommandFailure("error"));
    } catch {
      showCommandFailure("error");
    }
  };
  const sendGroup = (
    groupId: string,
    kind: "confirm_group" | "remove_group"
  ): void => {
    const group = groups.get(groupId);
    if (!scope || !group) return;
    send({ ...scope, kind, groupId, expectedGroupRevision: group.revision });
  };
  const toggleRow = (rowId: string): void => {
    const row = rows.get(rowId);
    if (!row || !scope) return;
    if (row.selected) {
      send({
        ...scope,
        kind: "set_row_selected",
        rowId,
        expectedRowRevision: row.revision,
        selected: false,
      });
      return;
    }
    const group =
      row.assignment.state === "suggested"
        ? (groups.get(row.assignment.groupId) ?? null)
        : null;
    // A shared confirmation is disclosed in the row and applies to every
    // dependent account assignment; only the clicked row is selected.
    send({
      ...scope,
      kind: "select_row",
      rowId,
      expectedRowRevision: row.revision,
      groupId: group?.groupId ?? null,
      expectedGroupRevision: group?.revision ?? null,
      hasSharedConfirmationDisclosure: group !== null,
    });
  };
  const openTransactionEdit = (rowId: string): void => {
    const row = rows.get(rowId);
    if (!row || !session || busy || props.boundary.input.signal?.aborted)
      return;
    setChoice(null);
    setTransactionEdit({
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      rowId,
      reviewRevision: session.revision,
      operationGeneration: session.operationGeneration,
      rowRevision: row.revision,
    });
  };
  const submitTransactionEdit = async (
    patch: ReviewTransactionEditPatch
  ): Promise<boolean> => {
    if (
      !session ||
      !editingRow ||
      !transactionEdit ||
      busy ||
      props.boundary.input.signal?.aborted
    )
      return false;
    try {
      // The facade command, reducer and owned SMS writer (or Voice memory
      // bridge) remain the SOLE mutation authority, not the old modal hook.
      const command = accountReviewCommandSchema.parse({
        kind: "edit_row_transaction",
        ownerId: transactionEdit.ownerId,
        sessionId: transactionEdit.sessionId,
        expectedReviewRevision: transactionEdit.reviewRevision,
        expectedOperationGeneration: transactionEdit.operationGeneration,
        rowId: transactionEdit.rowId,
        expectedRowRevision: transactionEdit.rowRevision,
        patch,
      });
      const result = await view.dispatch(command);
      if (result.reasonCodes.length > 0) {
        showCommandFailure("warning");
        return false;
      }
      return true;
    } catch {
      showCommandFailure("error");
      return false;
    }
  };
  const openRowChoice = (
    rowId: string,
    role: "source" | "destination" = "source"
  ): void => {
    const row = rows.get(rowId);
    if (!row || busy) return;
    setCandidateId(null);
    setChoice({ kind: "row", rowId, role });
  };
  const openCurrency = (rowId: string, context: string): void => {
    const row = rows.get(rowId);
    if (!row || busy) return;
    setCurrencySelection(
      row.currency.state === "known"
        ? row.currency.code
        : (row.currency.candidateCodes[0] ?? null)
    );
    setChoice({ kind: "currency", rowId, context });
  };
  const eligibleCandidates =
    choice?.kind === "row" && currentRow
      ? view.getAccountCandidates(currentRow.rowId, choice.role)
      : choice?.kind === "replace" && currentGroup
        ? (() => {
            const first = currentGroup.linkedRowIds[0];
            if (!first) return [];
            return view
              .getAccountCandidates(first, "source")
              .filter(
                (candidate) =>
                  candidate.type === currentGroup.type &&
                  currentGroup.linkedRowIds.every((id) =>
                    view
                      .getAccountCandidates(id, "source")
                      .some((other) => other.id === candidate.id)
                  )
              );
          })()
        : [];
  const useAccount = (): void => {
    if (
      !scope ||
      !candidateId ||
      !eligibleCandidates.some((candidate) => candidate.id === candidateId)
    )
      return;
    if (choice?.kind === "row" && currentRow) {
      send({
        ...scope,
        kind: "choose_row_account",
        rowId: currentRow.rowId,
        expectedRowRevision: currentRow.revision,
        accountId: candidateId,
      });
    } else if (choice?.kind === "replace" && currentGroup) {
      send({
        ...scope,
        kind: "replace_group_account",
        groupId: currentGroup.groupId,
        expectedGroupRevision: currentGroup.revision,
        accountId: candidateId,
        disclosedLinkedRowCount: currentGroup.linkedRowIds.length,
      });
    }
    setChoice(null);
  };
  const useCurrency = (): void => {
    if (!scope || choice?.kind !== "currency" || !currentRow) return;
    const checked = currencyCode.safeParse(currencySelection);
    if (!checked.success) return;
    send({
      ...scope,
      kind: "confirm_row_currency",
      rowId: currentRow.rowId,
      expectedRowRevision: currentRow.revision,
      currency: checked.data,
    });
    setChoice(null);
  };
  const useEdit = (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }): void => {
    if (!scope || choice?.kind !== "edit" || !currentGroup) return;
    const kind = accountType.safeParse(value.typeOptionId);
    if (!kind.success) return;
    send({
      ...scope,
      kind: "edit_group",
      groupId: currentGroup.groupId,
      expectedGroupRevision: currentGroup.revision,
      identity: {
        name: value.name,
        type: kind.data,
        institutionId: currentGroup.institutionId,
        providerDisplayName: currentGroup.providerDisplayName,
        cardLast4: currentGroup.cardLast4,
        senderNames: currentGroup.senderNames,
      },
      reconfirm: true,
    });
    setChoice(null);
  };
  const presentGroup = (
    g: AccountReviewSession["groups"][number]
  ): SharedSuggestedGroupView => {
    const summary = model?.groupSummaries.find(
      (item) => item.groupId === g.groupId
    );
    const linkedCount = summary?.liveLinkedRowIds.length ?? 0;
    const removed = g.status === "removed";
    return {
      groupId: g.groupId,
      displayName: g.name,
      identitySummary: [
        g.providerDisplayName,
        g.institutionId,
        g.cardLast4,
        ...g.senderNames,
      ]
        .filter((part) => part !== null && part.length > 0)
        .join(" · "),
      currencyLabel: g.currency,
      typeIconName:
        g.type === "CASH"
          ? "cash-outline"
          : g.type === "DIGITAL_WALLET"
            ? "wallet-outline"
            : "business-outline",
      linkedCount,
      statusLabel:
        g.status === "confirmed"
          ? reviewCopy("account_review_group_confirmed", language)
          : removed
            ? ""
            : reviewCopy("account_review_group_needs_review", language),
      disclosureText:
        String(linkedCount) +
        " " +
        reviewCopy("account_review_group_linked", language),
      isConfirmed: g.status === "confirmed",
      isRemoved: removed,
      isBusy: busy,
      canConfirm: !removed && g.status === "pending" && g.type !== null,
      canEdit: !removed,
      canReplace: !removed && linkedCount > 0,
      canRemove: !removed,
      canUndo:
        removed && view.undoToken !== null && view.undoGroupId === g.groupId,
    };
  };

  if (!session || !model || scope === null) {
    return (
      <View
        testID="account-review-canonical-loading"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        {props.title ? (
          <PageHeader
            title={props.title}
            subtitle={props.subtitle}
            variant="review"
            showDrawer={false}
            showBackButton={Boolean(props.onBack)}
            onBack={props.onBack}
          />
        ) : null}
        <View className="p-5">
          {view.error ? (
            <Text className="text-text-secondary dark:text-text-secondary-dark">
              {tTransactions("sms_review_load_failed")}
            </Text>
          ) : (
            <Skeleton width="100%" height={96} borderRadius={12} />
          )}
        </View>
      </View>
    );
  }

  const visibleRows = model.visibleRowIds.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row] : [];
  });
  const defaultAccountName = presentReviewDefaultAccountName(
    session.rows,
    view.choiceAccounts
  );
  const issueLabels = presentReviewIssueKeys(
    visibleRows,
    model.summary.distinctNeedsReviewCount
  ).map((key) =>
    key === "account_review_group_needs_review"
      ? reviewCopy(key, language)
      : tTransactions(key)
  );
  const summary = { ...model.summary, issueLabels };
  const choiceAccountOptions = presentReviewAccountChoices(eligibleCandidates);
  const checkedCurrency = currencyCode.safeParse(currencySelection);
  const currencyOptions = presentReviewCurrencyOptions(
    currentRow?.currency,
    checkedCurrency.success ? checkedCurrency.data : null
  );
  const renderRow = ({
    item: row,
    index,
  }: {
    readonly item: AccountReviewRow;
    readonly index: number;
  }): React.JSX.Element => {
    const linked =
      row.assignment.state === "suggested"
        ? groups.get(row.assignment.groupId)
        : null;
    const assignedName =
      row.assignment.state === "existing"
        ? (view.choiceAccounts.find(
            (account) => account.id === row.assignment.accountId
          )?.name ?? null)
        : (linked?.name ?? null);
    const content = getExpandedContent(row.transaction);
    const isSmsAtm =
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true;
    const destinationName =
      row.toAssignment?.state === "existing"
        ? (view.choiceAccounts.find(
            (account) => account.id === row.toAssignment?.accountId
          )?.name ?? null)
        : null;
    return (
      <View>
        <TransactionItem
          transaction={row.transaction}
          index={index}
          isSelected={row.selected}
          accountName={assignedName}
          expandedContentTitle={content?.title}
          expandedContentBody={content?.body}
          onToggleSelect={() => toggleRow(row.rowId)}
          onPress={() => openTransactionEdit(row.rowId)}
          hasMissingInfo={
            row.reviewReasons.length > 0 ||
            row.currency.state === "unconfirmed" ||
            row.assignment.state === "unresolved"
          }
          isSmsWorkspace={props.workspaceVariant === "sms"}
          accountReview={{
            rowId: row.rowId,
            accountActionLabel: isSmsAtm
              ? tTransactions("from_account")
              : choiceCopy("account_review_choice_use_account", language),
            accountStatusLabel: assignedName,
            sharedSelectionDisclosure: linked
              ? String(linked.linkedRowIds.length) +
                " " +
                reviewCopy("account_review_group_linked", language)
              : null,
            currencyActionLabel:
              row.currency.state === "unconfirmed"
                ? choiceCopy("account_review_choice_use_currency", language)
                : null,
            currencyContextLabel: reviewCopy(
              "account_review_group_locked_currency",
              language
            ),
            accountStatusTone:
              row.assignment.state === "existing"
                ? undefined
                : linked?.status === "confirmed"
                  ? "confirmed"
                  : linked?.status === "removed"
                    ? "removed"
                    : "pending",
            isBusy: busy,
            onChooseAccount: openRowChoice,
            onChooseCurrency: openCurrency,
          }}
        />
        {isSmsAtm ? (
          <View
            testID="account-review-atm-destination"
            className="gap-2 px-4 pb-3"
          >
            <Text
              testID="account-review-atm-destination-status"
              className="text-xs leading-[18px] text-text-secondary dark:text-text-secondary-dark"
            >
              {tTransactions("to_account")}:{" "}
              {destinationName ??
                tTransactions("please_select_destination_account")}
            </Text>
            <ReviewActionButton
              testID="account-review-atm-destination-action"
              label={tTransactions("to_account")}
              iconName="pencil-outline"
              disabled={busy}
              onPress={() => openRowChoice(row.rowId, "destination")}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      testID="transaction-review-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {props.title ? (
        <PageHeader
          title={props.title}
          subtitle={props.subtitle}
          variant="review"
          showDrawer={false}
          showBackButton={Boolean(props.onBack)}
          onBack={props.onBack}
          backAccessibilityLabel={tCommon("back")}
        />
      ) : null}
      <FlatList
        data={visibleRows}
        keyExtractor={(row) => row.rowId}
        renderItem={renderRow}
        extraData={session}
        ListHeaderComponent={
          <View>
            {props.partialResults && (
              <PartialSmsResultsNotice
                safeguardSummary={props.partialResults.safeguardSummary}
                retryableCount={props.partialResults.retryableCount}
                canRetry={props.partialResults.canRetry}
                isRetrying={props.partialResults.isRetrying}
                hasRetryError={props.partialResults.hasRetryError}
                onRetry={props.partialResults.onRetry}
              />
            )}
            <SafeguardQaDiagnosticsPanel
              diagnostics={props.qaDiagnostics ?? null}
            />
            <AccountReviewPanel
              filter={session.filter}
              visibleRowIds={model.visibleRowIds}
              readyVisibleRowIds={model.readyVisibleRowIds}
              groups={session.groups.map(presentGroup)}
              summary={summary}
              isAllGroupsSheetOpen={showAllGroups}
              isBusy={busy}
              defaultAccountName={defaultAccountName}
              isWhySheetOpen={showDefaultWhy}
              onFilterChange={(filter) =>
                send({ ...scope, kind: "set_filter", filter })
              }
              onSelectReady={() =>
                send({
                  ...scope,
                  kind: "select_ready",
                  filter: session.filter,
                })
              }
              onClearSelection={() =>
                send({
                  ...scope,
                  kind: "clear_selection",
                  filter: session.filter,
                })
              }
              onDefaultWhyPress={() => setShowDefaultWhy(true)}
              onCloseWhy={() => setShowDefaultWhy(false)}
              onConfirm={(groupId) => sendGroup(groupId, "confirm_group")}
              onEdit={(groupId) => {
                setChoice({ kind: "edit", groupId });
              }}
              onReplace={(groupId) => {
                setCandidateId(null);
                setChoice({ kind: "replace", groupId });
              }}
              onRemove={(groupId) => sendGroup(groupId, "remove_group")}
              onUndo={(groupId) => {
                if (busy || !view.undoToken || view.undoGroupId !== groupId)
                  return;
                void view.undoRemoval().catch(() => {
                  if (props.boundary.input.signal?.aborted) return;
                  showToast({
                    type: "error",
                    title: tTransactions("sms_review_undo_failed"),
                    message: tTransactions("sms_review_undo_failed_message"),
                  });
                });
              }}
              onViewAll={() => setShowAllGroups(true)}
              onCloseAllGroups={() => setShowAllGroups(false)}
            />
          </View>
        }
        contentContainerClassName="pb-2"
        showsVerticalScrollIndicator={false}
        {...ANDROID_SAFE_LIST_PROPS}
        initialNumToRender={props.renderConfig.initialNumToRender}
        maxToRenderPerBatch={props.renderConfig.maxToRenderPerBatch}
        updateCellsBatchingPeriod={props.renderConfig.updateCellsBatchingPeriod}
        windowSize={props.renderConfig.windowSize}
      />
      <ReviewActionBar
        selectedCount={model.summary.selectedCount}
        isSaving={busy}
        isReviewMetadataReady
        onSave={async () => {
          if (busy) return;
          setBusySave(true);
          try {
            await props.boundary.onSaveSelected(session);
          } finally {
            setBusySave(false);
          }
        }}
        onDiscard={props.onDiscard}
        hideDiscard={props.workspaceVariant === "sms"}
        isSmsWorkspace={props.workspaceVariant === "sms"}
        onReviewLater={props.onReviewLater}
      />
      <AccountChoiceSheet
        visible={choice?.kind === "row" || choice?.kind === "replace"}
        title={
          choice?.kind === "row" &&
          currentRow?.source === "SMS" &&
          currentRow.transaction.isAtmWithdrawal === true
            ? tTransactions(
                choice.role === "destination" ? "to_account" : "from_account"
              )
            : choiceCopy("account_review_choice_use_account", language)
        }
        contextSubtitle={
          currentGroup?.name ?? currentRow?.transaction.counterparty
        }
        scopeDisclosure={
          choice?.kind === "replace" && currentGroup
            ? String(currentGroup.linkedRowIds.length) +
              " " +
              reviewCopy("account_review_group_linked", language)
            : choiceCopy("account_review_choice_preserve_selection", language)
        }
        candidateOptions={choiceAccountOptions}
        selectedCandidateId={candidateId}
        canUseSelection={
          candidateId !== null &&
          eligibleCandidates.some((a) => a.id === candidateId)
        }
        isBusy={busy}
        onSelectCandidate={setCandidateId}
        onUseSelected={useAccount}
        onClose={() => setChoice(null)}
      />
      <CurrencyConfirmationSheet
        visible={choice?.kind === "currency"}
        contextSubtitle={choice?.kind === "currency" ? choice.context : ""}
        candidateOptions={currencyOptions.map((code) => ({
          code,
          label: code,
          accessibilityLabel: code,
        }))}
        selectedCandidateCode={currencySelection}
        canUseSelection={currencyCode.safeParse(currencySelection).success}
        isBusy={busy}
        onSelectCandidate={setCurrencySelection}
        onUseSelected={useCurrency}
        onChooseAnother={() => setShowCurrencyPicker(true)}
        onClose={() => setChoice(null)}
      />
      <CurrencyPicker
        visible={showCurrencyPicker}
        selectedCurrency={
          currencyCode.safeParse(currencySelection).success
            ? currencyCode.parse(currencySelection)
            : null
        }
        allowedCurrencies={ACCOUNT_REVIEW_CURRENCIES}
        contextSubtitle={
          choice?.kind === "currency" ? choice.context : undefined
        }
        onSelect={(code) => setCurrencySelection(code)}
        onClose={() => setShowCurrencyPicker(false)}
      />
      {editingRow && transactionEdit && (
        <TransactionEditModal
          key={
            transactionEdit.ownerId +
            ":" +
            transactionEdit.sessionId +
            ":" +
            transactionEdit.rowId +
            ":" +
            transactionEdit.rowRevision
          }
          controlledReview
          visible
          row={editingRow}
          ownerId={transactionEdit.ownerId}
          signal={props.boundary.input.signal}
          isBusy={busy}
          onSubmit={submitTransactionEdit}
          onClose={() =>
            setTransactionEdit((active) =>
              active &&
              active.ownerId === transactionEdit.ownerId &&
              active.sessionId === transactionEdit.sessionId &&
              active.rowId === transactionEdit.rowId &&
              active.reviewRevision === transactionEdit.reviewRevision &&
              active.operationGeneration ===
                transactionEdit.operationGeneration &&
              active.rowRevision === transactionEdit.rowRevision
                ? null
                : active
            )
          }
        />
      )}
      <EditSuggestedAccountSheet
        visible={choice?.kind === "edit" && currentGroup !== null}
        groupId={currentGroup?.groupId ?? ""}
        groupName={currentGroup?.name ?? ""}
        currentTypeOptionId={currentGroup?.type ?? ""}
        allowedTypeOptions={ACCOUNT_REVIEW_ACCOUNT_TYPES.map((type) => ({
          id: type,
          label: tAccounts("type_" + type.toLowerCase()),
        }))}
        lockedCurrencyLabel={currentGroup?.currency ?? ""}
        identitySummary={
          currentGroup?.providerDisplayName ?? currentGroup?.institutionId ?? ""
        }
        linkedCount={currentGroup?.linkedRowIds.length ?? 0}
        canSubmit={!busy && currentGroup?.status !== "removed"}
        isBusy={busy}
        validationMessage={null}
        onSubmit={useEdit}
        onReplace={() => {
          if (!currentGroup) return;
          setCandidateId(null);
          setChoice({ kind: "replace", groupId: currentGroup.groupId });
        }}
        onCancel={() => setChoice(null)}
      />
    </View>
  );
}
