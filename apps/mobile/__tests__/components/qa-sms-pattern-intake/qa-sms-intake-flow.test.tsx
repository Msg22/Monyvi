import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { FlatList, type FlatListProps } from "react-native";
import type { QaInboxMessage, QaSanitizedCandidateDraft } from "@monyvi/logic";
import enQaSmsPatternIntake from "@/locales/en/qa-sms-pattern-intake.json";
import { QaSmsAuthorization } from "@/components/qa-sms-pattern-intake/QaSmsAuthorization";
import { QaSmsExportSummary } from "@/components/qa-sms-pattern-intake/QaSmsExportSummary";
import { QaSmsMessageList } from "@/components/qa-sms-pattern-intake/QaSmsMessageList";
import { QaSmsSanitizedReview } from "@/components/qa-sms-pattern-intake/QaSmsSanitizedReview";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: {
        readonly count?: number;
        readonly provider?: string;
        readonly placeholder?: string;
      }
    ) => {
      if (options?.count !== undefined) return `${key}:${options.count}`;
      if (options?.provider !== undefined) return `${key}:${options.provider}`;
      if (options?.placeholder !== undefined) {
        return `${key}:${options.placeholder}`;
      }
      return key;
    },
  }),
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="skeleton" />;
  },
}));

const message: QaInboxMessage = {
  localSelectionId: "local-1",
  nativeMessageId: "native-1",
  sender: "QNB",
  body: "Raw local preview",
  receivedAtMs: 1_750_000_000_000,
  smsFingerprint: "fingerprint-1",
  isSelected: false,
};

const draft = {
  draftId: "draft-1",
  verifiedSenderAlias: "QNB",
  providerId: "qnb-egypt",
  messageFamily: "card_purchase",
  currency: "EGP",
  expectedOutcome: {
    kind: "transaction",
    direction: "expense",
    requiredPlaceholderRoles: ["transaction_amount"],
    confidenceCeiling: 0.8,
    reviewStatus: "needs_review",
    reviewReasons: ["candidate_pattern"],
  },
  classificationStatus: "confirmed",
  segments: [
    { kind: "fixed", text: "Your card " },
    {
      kind: "placeholder",
      token: "LAST4",
      semanticRole: "card_last4",
      wasOperatorCorrected: false,
    },
    { kind: "fixed", text: " was used for " },
    {
      kind: "placeholder",
      token: "AMOUNT",
      semanticRole: "transaction_amount",
      wasOperatorCorrected: false,
    },
  ],
  evidenceDigest: "digest-1",
  authorization: {
    version: 1,
    authorizationClass: "qa_operator_explicit",
    authorizedAt: "2026-07-13T00:00:00.000Z",
    providerScope: "qnb-egypt",
    currencyScope: ["EGP", "USD"],
    messageFamilyScope: ["card_purchase"],
  },
  validationFindings: [],
  status: "validated",
} satisfies QaSanitizedCandidateDraft;

describe("QA SMS intake approved flow states", () => {
  beforeAll(() => jest.useFakeTimers());
  afterEach(() => act(() => jest.runOnlyPendingTimers()));
  afterAll(() => jest.useRealTimers());

  it("uses the approved provider-neutral authorization copy", () => {
    expect(enQaSmsPatternIntake.authorization_description).toBe(
      "Selected financial messages are sanitized on this device. Raw messages are never exported."
    );
  });

  it("keeps authorization disabled until the explicit acknowledgement", () => {
    const onAuthorize = jest.fn();
    const { rerender } = render(
      <QaSmsAuthorization
        isAcknowledged={false}
        canAuthorize={false}
        onAcknowledgedChange={jest.fn()}
        onAuthorize={onAuthorize}
        onCancel={jest.fn()}
        bottomInset={24}
      />
    );
    expect(screen.getByTestId("qa-sms-authorize-action")).toBeDisabled();
    expect(screen.getByTestId("qa-sms-authorization")).toHaveStyle({
      paddingBottom: 24,
    });

    rerender(
      <QaSmsAuthorization
        isAcknowledged
        canAuthorize
        onAcknowledgedChange={jest.fn()}
        onAuthorize={onAuthorize}
        onCancel={jest.fn()}
        bottomInset={24}
      />
    );
    fireEvent.press(screen.getByTestId("qa-sms-authorize-action"));
    expect(onAuthorize).toHaveBeenCalled();
  });

  it("renders a virtualized selection list, loading skeletons, and sticky action", () => {
    const messages = [message];
    const { rerender, UNSAFE_getByType } = render(
      <QaSmsMessageList
        messages={[]}
        selectedIds={[]}
        isLoading
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB"
        bottomInset={20}
      />
    );
    expect(screen.getByTestId("qa-sms-message-skeletons")).toBeTruthy();
    expect(screen.getAllByTestId(/^qa-sms-message-skeleton-row-/)).toHaveLength(
      5
    );
    expect(screen.getByTestId("qa-sms-selection-footer")).toHaveStyle({
      paddingBottom: 20,
    });
    expect(screen.getByTestId("qa-sms-loading-footer-action")).toBeTruthy();

    rerender(
      <QaSmsMessageList
        messages={messages}
        selectedIds={["local-1"]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB"
        bottomInset={20}
      />
    );
    expect(screen.getByTestId("qa-sms-message-list")).toBeTruthy();
    const MessageFlatList = FlatList as unknown as React.ComponentType<
      FlatListProps<QaInboxMessage>
    >;
    const listInstance: unknown = UNSAFE_getByType(MessageFlatList);
    if (typeof listInstance !== "object" || listInstance === null) {
      throw new Error("qa_sms_message_list_missing");
    }
    const listProps = Reflect.get(
      listInstance,
      "props"
    ) as unknown as FlatListProps<QaInboxMessage>;
    expect(listProps.data).toBe(messages);
    expect(listProps).toMatchObject({
      initialNumToRender: 10,
      maxToRenderPerBatch: 10,
      updateCellsBatchingPeriod: 50,
      windowSize: 5,
      removeClippedSubviews: true,
    });
    expect(screen.getByTestId("qa-sms-selection-footer")).toHaveStyle({
      paddingBottom: 20,
    });
  });

  it("shows the approved verified-provider empty state and retries the bounded query", () => {
    const onRetry = jest.fn();
    render(
      <QaSmsMessageList
        messages={[]}
        selectedIds={[]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={onRetry}
        providerName="QNB"
        bottomInset={20}
      />
    );

    expect(screen.getByText("QNB")).toBeTruthy();
    expect(screen.getByText("empty_title")).toBeTruthy();
    expect(screen.getByText("empty_description")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-sanitize-selected")).toBeDisabled();
    fireEvent.press(screen.getByTestId("qa-sms-empty-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("opens the selection filter sheet and applies visible-row filters", () => {
    const usdMessage = {
      ...message,
      localSelectionId: "local-usd",
      nativeMessageId: "native-usd",
      body: "Synthetic USD fixture",
    };
    render(
      <QaSmsMessageList
        messages={[message, usdMessage]}
        selectedIds={[]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB"
        bottomInset={20}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-open-filters"));
    expect(screen.getByTestId("qa-sms-filter-sheet")).toBeTruthy();
    expect(
      screen.getByTestId("qa-sms-filter-currency-all-selected-background")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-filter-currency-usd"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-filters"));
    expect(screen.getByTestId("qa-sms-message-0")).toBeTruthy();
    expect(screen.queryByTestId("qa-sms-message-native-usd")).toBeNull();
    expect(screen.queryByTestId("qa-sms-message-native-1")).toBeNull();
  });

  it("keeps compact currency messages visible in currency filters", () => {
    const compactEgpMessage = {
      ...message,
      body: "Synthetic available bal.EGP12345.67",
    };
    const usdMessage = {
      ...message,
      localSelectionId: "local-usd",
      nativeMessageId: "native-usd",
      body: "Synthetic USD 25.00",
    };
    const arabicEgpMessages = ["ج.م", "جم", "جنيه"].map((alias, index) => ({
      ...message,
      localSelectionId: `local-egp-ar-${index}`,
      nativeMessageId: `native-egp-ar-${index}`,
      body: `Synthetic ${alias} 25.00`,
    }));
    render(
      <QaSmsMessageList
        messages={[compactEgpMessage, ...arabicEgpMessages, usdMessage]}
        selectedIds={[]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB EGYPT"
        bottomInset={20}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-open-filters"));
    fireEvent.press(screen.getByTestId("qa-sms-filter-currency-egp"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-filters"));

    expect(screen.getByText(compactEgpMessage.body)).toBeTruthy();
    for (const arabicEgpMessage of arabicEgpMessages) {
      expect(screen.getByText(arabicEgpMessage.body)).toBeTruthy();
    }
    expect(screen.queryByText(usdMessage.body)).toBeNull();
  });

  it("searches sender and message body while composing with active filters", () => {
    const onSelectNewest = jest.fn();
    const egpIpnMessage = {
      ...message,
      body: "Incoming IPN transfer EGP 250",
    };
    const usdIpnMessage = {
      ...message,
      localSelectionId: "local-usd-ipn",
      nativeMessageId: "native-usd-ipn",
      body: "Outgoing IPN transfer USD 25",
    };
    const purchaseMessage = {
      ...message,
      localSelectionId: "local-purchase",
      nativeMessageId: "native-purchase",
      sender: "QNB Cards",
      body: "Synthetic EGP 50",
    };
    render(
      <QaSmsMessageList
        messages={[egpIpnMessage, usdIpnMessage, purchaseMessage]}
        selectedIds={[]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={onSelectNewest}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB EGYPT"
        bottomInset={20}
      />
    );

    fireEvent.changeText(
      screen.getByTestId("qa-sms-search-input"),
      "qnb cards"
    );
    expect(screen.getByText(purchaseMessage.body)).toBeTruthy();
    expect(screen.queryByText(egpIpnMessage.body)).toBeNull();

    fireEvent.changeText(screen.getByTestId("qa-sms-search-input"), "ipn");
    expect(screen.getByText(egpIpnMessage.body)).toBeTruthy();
    expect(screen.getByText(usdIpnMessage.body)).toBeTruthy();
    expect(screen.queryByText(purchaseMessage.body)).toBeNull();

    fireEvent.press(screen.getByTestId("qa-sms-open-filters"));
    fireEvent.press(screen.getByTestId("qa-sms-filter-currency-usd"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-filters"));
    expect(screen.queryByText(egpIpnMessage.body)).toBeNull();
    expect(screen.getByText(usdIpnMessage.body)).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-select-newest"));
    expect(onSelectNewest).toHaveBeenCalledWith([
      usdIpnMessage.localSelectionId,
    ]);

    fireEvent.press(screen.getByTestId("qa-sms-clear-search"));
    expect(screen.getByText(usdIpnMessage.body)).toBeTruthy();
    expect(screen.queryByText(purchaseMessage.body)).toBeNull();
  });

  it("keeps hidden selections and shows a search-specific empty state", () => {
    render(
      <QaSmsMessageList
        messages={[message]}
        selectedIds={[message.localSelectionId]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB EGYPT"
        bottomInset={20}
      />
    );

    fireEvent.changeText(
      screen.getByTestId("qa-sms-search-input"),
      "not present"
    );

    expect(screen.getByTestId("qa-sms-search-empty-state")).toBeTruthy();
    expect(screen.getByText("selected_count:1")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-sanitize-selected")).toBeEnabled();
  });

  it("shows the full provider, loaded count, and selects newest filtered messages", () => {
    const onSelectNewest = jest.fn();
    const secondMessage = {
      ...message,
      localSelectionId: "local-2",
      nativeMessageId: "native-2",
      body: "USD transfer",
    };
    render(
      <QaSmsMessageList
        messages={[message, secondMessage]}
        selectedIds={["local-1"]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={onSelectNewest}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB EGYPT"
        bottomInset={20}
      />
    );

    expect(screen.getByText("QNB EGYPT")).toBeTruthy();
    expect(screen.getByText("message_selection_summary")).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-select-newest"));
    expect(onSelectNewest).toHaveBeenCalledWith(["local-1", "local-2"]);
  });

  it("dismisses the filter sheet when its backdrop is pressed", () => {
    render(
      <QaSmsMessageList
        messages={[message]}
        selectedIds={[]}
        isLoading={false}
        onToggle={jest.fn()}
        onSelectNewest={jest.fn()}
        onSanitize={jest.fn()}
        onRetry={jest.fn()}
        providerName="QNB EGYPT"
        bottomInset={20}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-open-filters"));
    fireEvent.press(screen.getByTestId("qa-sms-filter-sheet-backdrop"));
    expect(screen.queryByTestId("qa-sms-filter-sheet")).toBeNull();
  });

  it("opens the approved classification sheet and saves explicit choices", () => {
    const onClassify = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={onClassify}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={24}
        bottomInset={28}
      />
    );
    fireEvent.press(screen.getByTestId("qa-sms-classification-summary"));
    expect(screen.getByTestId("qa-sms-classification-sheet")).toBeTruthy();
    expect(screen.getAllByTestId(/^qa-sms-family-/)).toHaveLength(11);
    expect(
      screen.getByTestId("qa-sms-currency-egp-selected-background")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-family-otp"));
    fireEvent.press(screen.getByTestId("qa-sms-currency-na"));
    fireEvent.press(screen.getByTestId("qa-sms-save-classification"));
    expect(onClassify).toHaveBeenCalledWith({
      messageFamily: "otp",
      currency: null,
    });
  });

  it("shows detected currency before classification and prefills the picker", () => {
    const unclassifiedDraft: QaSanitizedCandidateDraft = {
      ...draft,
      messageFamily: null,
      currency: "EGP",
      expectedOutcome: null,
      classificationStatus: "pending",
      status: "draft",
    };
    render(
      <QaSmsSanitizedReview
        draft={unclassifiedDraft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => unclassifiedDraft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    expect(screen.getByTestId("qa-sms-template-currency")).toHaveTextContent(
      "EGP"
    );
    fireEvent.press(screen.getByTestId("qa-sms-classification-summary"));
    expect(
      screen.getByTestId("qa-sms-currency-egp-selected-background")
    ).toBeTruthy();
  });

  it("keeps bank-to-wallet classification on its supported EGP currency", () => {
    const onClassify = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={{ ...draft, currency: "USD" }}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={onClassify}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={24}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-classification-summary"));
    fireEvent.press(
      screen.getByTestId("qa-sms-family-bank-to-wallet-transfer")
    );

    expect(screen.getByTestId("qa-sms-currency-usd")).toBeDisabled();
    expect(
      screen.getByTestId("qa-sms-currency-egp-selected-background")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-save-classification"));
    expect(onClassify).toHaveBeenCalledWith({
      messageFamily: "bank_to_wallet_transfer",
      currency: "EGP",
    });
  });

  it("stages multiple placeholder corrections and applies them once", () => {
    const onApplyCorrections = jest.fn();
    const onPreviewCorrections = jest.fn(() => draft);
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={onPreviewCorrections}
        onApplyCorrections={onApplyCorrections}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );
    expect(screen.queryByText("Raw local preview")).toBeNull();
    fireEvent.press(screen.getByText("edit_placeholders"));
    expect(screen.getByTestId("qa-sms-local-raw-preview")).toHaveProp(
      "selectable",
      false
    );
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-4-9"));
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-merchant"));
    expect(
      screen.getByTestId("qa-sms-correction-token-merchant")
    ).not.toHaveProp(
      "className",
      expect.stringContaining("bg-nileGreen-500/10")
    );
    expect(
      screen.getByTestId("qa-sms-correction-token-merchant-selected-background")
    ).toBeTruthy();
    expect(screen.getByTestId("qa-sms-placeholder-correction")).toHaveStyle({
      paddingTop: 40,
      paddingBottom: 28,
    });
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    expect(screen.getByTestId("qa-sms-placeholder-correction")).toBeTruthy();

    fireEvent.press(screen.getByTestId("qa-sms-raw-part-10-17"));
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-reference"));
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));

    expect(screen.getByText("pending_changes:2")).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-apply-corrections"));
    expect(onApplyCorrections).toHaveBeenCalledWith([
      {
        startOffset: 4,
        endOffset: 9,
        token: "MERCHANT",
        semanticRole: "merchant_name",
      },
      {
        startOffset: 10,
        endOffset: 17,
        token: "REFERENCE",
        semanticRole: "transaction_reference",
      },
    ]);
  });

  it("selects an exact contiguous range with two taps and clears it", () => {
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="EGP250000 at QA SHOP"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByText("edit_placeholders"));
    expect(screen.getByTestId("qa-sms-raw-part-0-3")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-raw-part-3-9")).toBeTruthy();

    fireEvent.press(screen.getByTestId("qa-sms-raw-part-13-15"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-16-20"));
    expect(screen.getByTestId("qa-sms-raw-part-13-15")).toHaveProp(
      "className",
      expect.stringContaining("bg-nileGreen-700 text-slate-25")
    );
    expect(screen.getByTestId("qa-sms-raw-part-13-15")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-nileGreen-400 dark:text-slate-950")
    );
    expect(screen.getByTestId("qa-sms-add-correction")).toBeEnabled();

    fireEvent.press(screen.getByTestId("qa-sms-clear-selection"));
    expect(screen.queryByTestId("qa-sms-clear-selection")).toBeNull();
    expect(screen.getByTestId("qa-sms-add-correction")).toBeDisabled();
  });

  it("starts a fresh range after a completed two-tap selection", () => {
    const onApplyCorrections = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={onApplyCorrections}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByText("edit_placeholders"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-0-3"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-4-9"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-10-17"));
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-corrections"));

    expect(onApplyCorrections).toHaveBeenCalledWith([
      {
        startOffset: 10,
        endOffset: 17,
        token: "AMOUNT",
        semanticRole: "transaction_amount",
      },
    ]);
  });

  it("preserves exact offsets when the range is extended backwards", () => {
    const onApplyCorrections = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="EGP250000 at QA SHOP"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={onApplyCorrections}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByText("edit_placeholders"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-16-20"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-13-15"));
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-merchant"));
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-corrections"));

    expect(onApplyCorrections).toHaveBeenCalledWith([
      {
        startOffset: 13,
        endOffset: 20,
        token: "MERCHANT",
        semanticRole: "merchant_name",
      },
    ]);
  });

  it("offers ATM terminal as a single-role placeholder", () => {
    const onApplyCorrections = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Synthetic ATM terminal preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={onApplyCorrections}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByText("edit_placeholders"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-10-13"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-14-22"));
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-atm_terminal"));
    expect(screen.queryByText("placeholder_meaning")).toBeNull();
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-corrections"));

    expect(onApplyCorrections).toHaveBeenCalledWith([
      {
        startOffset: 10,
        endOffset: 22,
        token: "ATM_TERMINAL",
        semanticRole: "atm_terminal",
      },
    ]);
  });

  it("lets the operator choose a semantic meaning for multi-role placeholders", () => {
    const onApplyCorrections = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={onApplyCorrections}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={32}
        bottomInset={28}
      />
    );

    fireEvent.press(screen.getByText("edit_placeholders"));
    expect(screen.getByText("placeholder_meaning")).toBeTruthy();
    expect(
      screen.getByTestId("qa-sms-correction-role-transaction_amount")
    ).toBeTruthy();
    expect(
      screen.getByTestId("qa-sms-correction-role-promotional_amount")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-4-9"));
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-reference"));
    expect(
      screen.getByTestId("qa-sms-correction-role-message_code")
    ).toBeTruthy();
    expect(screen.getByTestId("qa-sms-correction-role-otp_code")).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-phone"));
    expect(
      screen.getByTestId("qa-sms-correction-role-provider_hotline")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-correction-token-account"));
    expect(screen.getByText("placeholder_meaning")).toBeTruthy();
    fireEvent.press(
      screen.getByTestId("qa-sms-correction-role-source_account_suffix")
    );
    expect(
      screen.getByTestId(
        "qa-sms-correction-role-source_account_suffix-selected-background"
      )
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    fireEvent.press(screen.getByTestId("qa-sms-apply-corrections"));

    expect(onApplyCorrections).toHaveBeenCalledWith([
      {
        startOffset: 4,
        endOffset: 9,
        token: "ACCOUNT",
        semanticRole: "source_account_suffix",
      },
    ]);
  });

  it("removes a pending correction without closing the editor", () => {
    render(
      <QaSmsSanitizedReview
        draft={draft}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={jest.fn()}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={24}
        bottomInset={28}
      />
    );
    fireEvent.press(screen.getByText("edit_placeholders"));
    fireEvent.press(screen.getByTestId("qa-sms-raw-part-4-9"));
    fireEvent.press(screen.getByTestId("qa-sms-add-correction"));
    fireEvent.press(screen.getByTestId("qa-sms-remove-correction-0"));

    expect(screen.getByText("pending_changes:0")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-placeholder-correction")).toBeTruthy();
  });

  it("explains blocking findings and lets the operator discard the candidate", () => {
    const onDiscard = jest.fn();
    render(
      <QaSmsSanitizedReview
        draft={{
          ...draft,
          status: "blocked",
          validationFindings: [
            {
              code: "required_placeholder_missing",
              severity: "blocking",
              segmentIndex: null,
              messageKey: "qaSmsIntake.privacy.required_placeholder_missing",
              semanticRole: "transaction_amount",
            },
          ],
        }}
        position={1}
        total={1}
        isLoading={false}
        rawPreview="Raw local preview"
        onClassify={jest.fn()}
        onApprove={jest.fn()}
        onDiscard={onDiscard}
        onEditPlaceholders={jest.fn()}
        onPreviewCorrections={jest.fn(() => draft)}
        onApplyCorrections={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
        topInset={24}
        bottomInset={28}
      />
    );

    expect(
      screen.getByText(
        "finding_required_placeholder_missing:placeholder_role_transaction_amount"
      )
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("qa-sms-discard-candidate"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("qa-sms-next-candidate")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
  });

  it("shows aggregate-only export details with safe-area-aware actions", () => {
    render(
      <QaSmsExportSummary
        approvedCandidateCount={6}
        reviewedFamilyCount={9}
        isPreparing={false}
        errorCode={null}
        onExport={jest.fn()}
        onBack={jest.fn()}
        bottomInset={22}
      />
    );
    expect(screen.queryByText("Raw local preview")).toBeNull();
    expect(screen.getByTestId("qa-sms-export-actions")).toHaveStyle({
      paddingBottom: 22,
    });
  });

  it("shows a safe recovery message when local export fails", () => {
    render(
      <QaSmsExportSummary
        approvedCandidateCount={1}
        reviewedFamilyCount={1}
        isPreparing={false}
        errorCode="file_write_failed"
        onExport={jest.fn()}
        onBack={jest.fn()}
        bottomInset={22}
      />
    );

    expect(screen.getByText("export_failed_title")).toBeTruthy();
    expect(screen.getByText("export_failed_message")).toBeTruthy();
  });
});
