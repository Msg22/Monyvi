/**
 * #395 FR-019 RNTL contract, authored before Phase B modal wiring.
 * A canonical edit cannot call legacy useTransactionEditState, pending
 * account creation, old onTransactionChange, or the old Save authority.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { TransactionEditModal } from "@/components/transaction-review/edit-modal/TransactionEditModal";
import {
  makeT025ReviewSession,
  T025_IDS,
} from "../../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import { canonicalVoiceReview } from "../../../../../packages/logic/src/account-review/__tests__/review-command-fixtures";
import type { AccountReviewRow } from "../../../../../packages/logic/src/account-review/review-schemas";

const mockLoadCategories = jest.fn();
jest.mock(
  "@/services/account-review-transaction-edit-category-service",
  () => ({
    loadCurrentAccountReviewEditorCategories: (...args: unknown[]): unknown =>
      mockLoadCategories(...args),
  })
);
jest.mock("@/hooks/useTransactionEditState", () => ({
  useTransactionEditState: () => {
    throw new Error("canonical_editor_must_not_call_legacy_writer_state");
  },
}));
jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: () => 16,
}));
jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: ({
    visible,
    onSelect,
  }: {
    visible: boolean;
    onSelect: (id: string) => void;
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return visible
      ? ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: "canonical-edit-pick-category",
            onPress: () => onSelect("00000000-0000-4000-8000-000000000206"),
          },
          ReactActual.createElement(RN.Text, null, "Other")
        )
      : null;
  },
}));
jest.mock("@/components/add-transaction/TypeTabs", () => ({
  TypeTabs: ({
    onSelect,
  }: {
    onSelect: (type: "EXPENSE" | "INCOME") => void;
  }) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(
      RN.TouchableOpacity,
      {
        testID: "canonical-edit-type-toggle",
        onPress: () => onSelect("INCOME"),
      },
      ReactActual.createElement(RN.Text, null, "Income")
    );
  },
}));
// The controlled editor's real ReviewInlineNotice uses LocaleContext.
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: "en", isRTL: false }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

const catId = "00000000-0000-4000-8000-000000000206";
const owner = T025_IDS.owner;
const saved = jest.fn<Promise<boolean>, [Record<string, unknown>]>();
const close = jest.fn();

function renderSms(
  signal?: AbortSignal,
  rowOverride?: AccountReviewRow,
  isBusy = false
): ReturnType<typeof render> {
  const row = rowOverride ?? makeT025ReviewSession().rows[0];
  if (!row || row.source !== "SMS") throw new Error("Missing original SMS row");
  return render(
    <TransactionEditModal
      controlledReview
      visible
      ownerId={owner}
      signal={signal}
      isBusy={isBusy}
      row={row}
      onSubmit={saved}
      onClose={close}
    />
  );
}

function unconfirmedSmsRow(): AccountReviewRow {
  const original = makeT025ReviewSession().rows[0];
  if (!original || original.source !== "SMS")
    throw new Error("Missing original SMS fixture");
  return {
    ...original,
    currency: {
      state: "unconfirmed",
      reason: "ambiguous",
      candidateCodes: [],
      statedCode: null,
      evidenceSpans: [],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  saved.mockResolvedValue(true);
  mockLoadCategories.mockResolvedValue({
    snapshot: { ownerId: owner, categories: [] },
    records: [],
  });
});

describe("#395 canonical TransactionEditModal V2 controlled fields", () => {
  it("edits only allowed SMS amount and never invokes the old modal state/writer", async () => {
    const screen = renderSms();
    await waitFor(() =>
      expect(mockLoadCategories).toHaveBeenCalledWith(owner, expect.anything())
    );
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "60.25"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({
        amountDecimal: "60.25",
      })
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("legacy-account-selector")).toBeNull();
    expect(screen.queryByTestId("sms-edit-account")).toBeNull();
    expect(screen.queryByTestId("sms-edit-currency")).toBeNull();
    expect(screen.queryByTestId("canonical-edit-type-toggle")).toBeNull();
  });

  it("Cancel closes without dispatching any business command", () => {
    const screen = renderSms();
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "70"
    );
    fireEvent.press(screen.getByTestId("account-review-edit-cancel"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });

  it("keeps the modal open after a rejected/stale writer and retains corrected values", async () => {
    saved.mockResolvedValue(false);
    const screen = renderSms();
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "70"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ amountDecimal: "70" })
    );
    // A rejected async command must really settle and release its Save
    // exclusion before we assert the editor remains visible.
    await waitFor(() => {
      const saveButton = screen.getByTestId("account-review-edit-save");
      expect(saveButton).toHaveProp("accessibilityRole", "button");
      // TouchableOpacity's native host omits disabled=false.
      expect(saveButton).not.toHaveProp("disabled", true);
      expect(
        screen.getByTestId("account-review-edit-amount-input")
      ).not.toHaveProp("editable", false);
    });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("70")).toBeTruthy();
    // The rejected writer actually settled: this same corrected patch can be
    // submitted again without waiting on an unresolved Save.
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    expect(saved).toHaveBeenLastCalledWith({ amountDecimal: "70" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("70")).toBeTruthy();
  });

  it("uses actual scoped category choices and submits only its ID, never UI labels", async () => {
    mockLoadCategories.mockResolvedValue({
      snapshot: { ownerId: owner, categories: [] },
      records: [
        {
          id: catId,
          userId: null,
          isSystem: true,
          deleted: false,
          isHidden: false,
          isInternal: false,
          type: "EXPENSE",
          level: 1,
          parentId: null,
          displayName: "Other",
        },
      ],
    });
    const screen = renderSms();
    await waitFor(() => {
      expect(mockLoadCategories).toHaveBeenCalledWith(owner, expect.anything());
      // Readiness must allow the actual category picker to open, not just
      // omit a disabled=false prop from the native touchable host.
      expect(screen.getByTestId("account-review-edit-category")).not.toHaveProp(
        "disabled",
        true
      );
    });
    fireEvent.press(screen.getByTestId("account-review-edit-category"));
    expect(screen.getByTestId("canonical-edit-pick-category")).toBeTruthy();
    fireEvent.press(screen.getByTestId("canonical-edit-pick-category"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({
        categoryId: catId,
      })
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("rejects an aborted editor without invoking the Save callback", () => {
    const abort = new AbortController();
    const screen = renderSms(abort.signal);
    abort.abort();
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "70"
    );
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
    });
    expect(saved).not.toHaveBeenCalled();
  });

  it("Voice retains approved conditional type toggle and note with no SMS writer", async () => {
    const voice = await canonicalVoiceReview();
    const row = voice.rows[0];
    if (!row || row.source !== "VOICE") throw new Error("Missing Voice");
    mockLoadCategories.mockResolvedValue({
      snapshot: { ownerId: voice.ownerId, categories: [] },
      records: [],
    });
    const screen = render(
      <TransactionEditModal
        controlledReview
        visible
        ownerId={voice.ownerId}
        row={row}
        onSubmit={saved}
        onClose={close}
      />
    );
    expect(screen.getByTestId("account-review-edit-note")).toBeTruthy();
    expect(screen.getByTestId("canonical-edit-type-toggle")).toBeTruthy();
    expect(screen.queryByTestId("sms-edit-account")).toBeNull();
  });
  it("allows a counterparty-only edit under unconfirmed currency without sending an amount", async () => {
    const screen = renderSms(undefined, unconfirmedSmsRow());
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-counterparty-input"),
      "Corrected shop"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ counterparty: "Corrected shop" })
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("still blocks actual amount changes under unconfirmed currency, preserving the original financial blocker", () => {
    const screen = renderSms(undefined, unconfirmedSmsRow());
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "60.25"
    );
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
    });
    expect(saved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByTestId("account-review-edit-error")).toBeTruthy();
  });

  it("allows current owner-scoped category ID confirmation without confirmed currency", async () => {
    mockLoadCategories.mockResolvedValue({
      snapshot: { ownerId: owner, categories: [] },
      records: [
        {
          id: catId,
          userId: null,
          isSystem: true,
          deleted: false,
          isHidden: false,
          isInternal: false,
          type: "EXPENSE",
          level: 1,
          parentId: null,
          displayName: "Other",
        },
      ],
    });
    const screen = renderSms(undefined, unconfirmedSmsRow());
    await waitFor(() => {
      expect(mockLoadCategories).toHaveBeenCalledWith(owner, expect.anything());
      // Readiness must allow the actual category picker to open, not just
      // omit a disabled=false prop from the native touchable host.
      expect(screen.getByTestId("account-review-edit-category")).not.toHaveProp(
        "disabled",
        true
      );
    });
    fireEvent.press(screen.getByTestId("account-review-edit-category"));
    expect(screen.getByTestId("canonical-edit-pick-category")).toBeTruthy();
    fireEvent.press(screen.getByTestId("canonical-edit-pick-category"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ categoryId: catId })
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("refuses cancel, backdrop and hardware Back while an accepted Save is pending", async () => {
    let resolvePending: ((value: boolean) => void) | undefined;
    const pending = new Promise<boolean>((resolve) => {
      resolvePending = resolve;
    });
    saved.mockReturnValueOnce(pending);
    const screen = renderSms();
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "60.25"
    );
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
    });
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-cancel"));
      fireEvent.press(screen.getByTestId("account-review-edit-backdrop"));
      fireEvent(
        screen.getByTestId("account-review-edit-modal"),
        "requestClose"
      );
    });
    expect(close).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
    const resolve = resolvePending;
    if (!resolve) throw new Error("Pending command was not entered");
    await act(async () => {
      resolve(true);
      await pending;
    });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("keeps the editor open if pending Save is refused, then permits user dismissal after it settles", async () => {
    let resolvePending: ((value: boolean) => void) | undefined;
    const pending = new Promise<boolean>((resolve) => {
      resolvePending = resolve;
    });
    saved.mockReturnValueOnce(pending);
    const screen = renderSms();
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-amount-input"),
      "60.25"
    );
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
    });
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    act(() => {
      fireEvent(
        screen.getByTestId("account-review-edit-modal"),
        "requestClose"
      );
    });
    expect(close).not.toHaveBeenCalled();
    const resolve = resolvePending;
    if (!resolve) throw new Error("Pending edit did not begin");
    await act(async () => {
      resolve(false);
      await pending;
    });
    await waitFor(() => {
      const saveButton = screen.getByTestId("account-review-edit-save");
      expect(saveButton).toHaveProp("accessibilityRole", "button");
      // TouchableOpacity's native host omits disabled=false.
      expect(saveButton).not.toHaveProp("disabled", true);
      expect(
        screen.getByTestId("account-review-edit-amount-input")
      ).not.toHaveProp("editable", false);
    });
    expect(close).not.toHaveBeenCalled();
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-cancel"));
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not close from any dismiss path while the canonical facade is busy", () => {
    const screen = renderSms(undefined, undefined, true);
    act(() => {
      fireEvent.press(screen.getByTestId("account-review-edit-cancel"));
      fireEvent.press(screen.getByTestId("account-review-edit-backdrop"));
      fireEvent(
        screen.getByTestId("account-review-edit-modal"),
        "requestClose"
      );
    });
    expect(close).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it("Voice note-only correction survives unconfirmed currency without an amount patch", async () => {
    const voice = await canonicalVoiceReview();
    const original = voice.rows[0];
    if (!original || original.source !== "VOICE")
      throw new Error("Expected normalized Voice row");
    const row: AccountReviewRow = {
      ...original,
      currency: {
        state: "unconfirmed",
        reason: "ambiguous",
        candidateCodes: [],
        statedCode: null,
        evidenceSpans: [],
      },
    };
    mockLoadCategories.mockResolvedValue({
      snapshot: { ownerId: voice.ownerId, categories: [] },
      records: [],
    });
    const screen = render(
      <TransactionEditModal
        controlledReview
        visible
        ownerId={voice.ownerId}
        row={row}
        onSubmit={saved}
        onClose={close}
      />
    );
    fireEvent.changeText(
      screen.getByTestId("account-review-edit-note"),
      "Edited voice note"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("account-review-edit-save"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith({ note: "Edited voice note" })
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
