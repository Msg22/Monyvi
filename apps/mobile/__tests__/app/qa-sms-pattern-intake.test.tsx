import { render, screen } from "@testing-library/react-native";
import React from "react";
import { router } from "expo-router";
import type { UseQaSmsPatternIntakeResult } from "@/hooks/useQaSmsPatternIntake";

let mockIsAvailable = false;
let mockHookResult: UseQaSmsPatternIntakeResult;
const mockShowToast = jest.fn();
interface MockPageHeaderProps {
  readonly onBack: () => void;
}
const mockPageHeader = jest.fn<void, [MockPageHeaderProps]>();
interface MockMessageListProps {
  readonly providerName: string;
  readonly onRetry: () => void;
}
const mockMessageList = jest.fn<void, [MockMessageListProps]>();
interface MockSanitizedReviewProps {
  readonly topInset: number;
  readonly bottomInset: number;
}
const mockSanitizedReview = jest.fn<void, [MockSanitizedReviewProps]>();
interface MockExportSummaryProps {
  readonly reviewedFamilyCount: number;
}
const mockExportSummary = jest.fn<void, [MockExportSummaryProps]>();

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }), {
  virtual: true,
});

jest.mock("@/config/qa-sms-pattern-intake-config", () => ({
  getQaSmsPatternIntakeAvailability: () =>
    mockIsAvailable
      ? { isAvailable: true }
      : { isAvailable: false, reason: "flag_disabled" },
}));

jest.mock("@/hooks/useQaSmsPatternIntake", () => ({
  useQaSmsPatternIntake: () => mockHookResult,
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: () => 48,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 30, left: 0, right: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (props: MockPageHeaderProps): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockPageHeader(props);
    return <View testID="page-header" />;
  },
}));

jest.mock("@/components/qa-sms-pattern-intake/QaSmsAuthorization", () => ({
  QaSmsAuthorization: (): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="authorization-state" />;
  },
}));

jest.mock("@/components/qa-sms-pattern-intake/QaSmsMessageList", () => ({
  QaSmsMessageList: (props: MockMessageListProps): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockMessageList(props);
    return <View testID="selection-state" />;
  },
}));

jest.mock("@/components/qa-sms-pattern-intake/QaSmsSanitizedReview", () => ({
  QaSmsSanitizedReview: (
    props: MockSanitizedReviewProps
  ): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockSanitizedReview(props);
    return <View testID="review-state" />;
  },
}));

jest.mock("@/components/qa-sms-pattern-intake/QaSmsExportSummary", () => ({
  QaSmsExportSummary: (props: MockExportSummaryProps): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockExportSummary(props);
    return <View testID="export-state" />;
  },
}));

jest.mock(
  "@/components/qa-sms-pattern-intake/QaSmsCoverageReview",
  () => ({
    QaSmsCoverageReview: (): React.JSX.Element => {
      const { View } =
        jest.requireActual<typeof import("react-native")>("react-native");
      return <View testID="coverage-state" />;
    },
  }),
  { virtual: true }
);

jest.mock("@/components/sms-sync/SmsPermissionPrompt", () => ({
  SmsPermissionPrompt: (): null => null,
}));

jest.mock("@/components/permissions/PermissionRecoveryModal", () => ({
  PermissionRecoveryModal: (): null => null,
}));

import QaSmsPatternIntakeScreen from "@/app/(private)/qa-sms-pattern-intake";

function createHookResult(
  step: UseQaSmsPatternIntakeResult["step"]
): UseQaSmsPatternIntakeResult {
  return {
    step,
    isAcknowledged: false,
    canAuthorize: false,
    isLoading: false,
    permissionStatus: "granted",
    errorCode: null,
    messages: [],
    selectedIds: [],
    drafts: [],
    candidateArtifacts: [],
    coverageDeclarations: [],
    pendingCoverageCount: 0,
    exportResult: null,
    currentDraft: null,
    currentRawPreview: null,
    currentDraftIndex: 0,
    setAcknowledged: jest.fn(),
    authorize: jest.fn(() => Promise.resolve()),
    requestPermission: jest.fn(() => Promise.resolve("granted")),
    retryMessages: jest.fn(() => Promise.resolve()),
    openSettings: jest.fn(() => Promise.resolve()),
    toggleMessage: jest.fn(),
    selectNewestMessages: jest.fn(),
    sanitizeSelected: jest.fn(() => Promise.resolve()),
    classifyCurrentDraft: jest.fn(),
    previewCurrentDraftCorrections: jest.fn(() => {
      throw new Error("candidate_not_ready");
    }),
    applyCurrentDraftCorrections: jest.fn(),
    approveCurrentDraft: jest.fn(),
    discardCurrentDraft: jest.fn(),
    showPreviousDraft: jest.fn(),
    showNextDraft: jest.fn(),
    goToCoverage: jest.fn(),
    updateCoverage: jest.fn(),
    markPendingCoverageUnavailable: jest.fn(),
    goToExport: jest.fn(),
    exportBundle: jest.fn(() => Promise.resolve()),
    recoverEvidenceSecret: jest.fn(() => Promise.resolve()),
    backToReview: jest.fn(),
    navigateBack: jest.fn(() => false),
    reset: jest.fn(),
  };
}

describe("QA SMS pattern intake route guard", () => {
  beforeEach(() => {
    mockIsAvailable = false;
    mockHookResult = createHookResult("authorization");
    mockPageHeader.mockReset();
    mockMessageList.mockReset();
    mockSanitizedReview.mockReset();
    mockExportSummary.mockReset();
    mockShowToast.mockReset();
    jest.mocked(router.back).mockReset();
  });

  it("shows friendly feedback after a bundle is exported", () => {
    mockIsAvailable = true;
    mockHookResult = {
      ...createHookResult("local_export"),
      exportResult: { status: "exported", candidateCount: 3 },
    };

    render(<QaSmsPatternIntakeScreen />);

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "success",
      title: "export_success_title",
      message: "export_success_message",
    });
  });

  it("counts unavailable coverage families as reviewed in the export summary", () => {
    mockIsAvailable = true;
    mockHookResult = {
      ...createHookResult("local_export"),
      coverageDeclarations: [
        {
          providerId: "qnb-egypt",
          messageFamily: "card_purchase",
          currency: "EGP",
          status: "candidate_collected",
          candidateIds: ["qa-candidate-123e4567-e89b-42d3-a456-426614174000"],
          recordedAt: "2026-07-13T00:00:00.000Z",
        },
        {
          providerId: "qnb-egypt",
          messageFamily: "atm_withdrawal",
          currency: "EGP",
          status: "unavailable_in_qa_dataset",
          candidateIds: [],
          recordedAt: "2026-07-13T00:00:00.000Z",
        },
      ],
    };

    render(<QaSmsPatternIntakeScreen />);

    expect(mockExportSummary).toHaveBeenCalledWith(
      expect.objectContaining({ reviewedFamilyCount: 2 })
    );
  });

  it("uses internal previous-step navigation before leaving the route", () => {
    mockIsAvailable = true;
    mockHookResult = createHookResult("sanitized_review");
    mockHookResult = {
      ...mockHookResult,
      currentDraft: {
        draftId: "draft-1",
        verifiedSenderAlias: "QNB",
        providerId: "qnb-egypt",
        messageFamily: null,
        currency: null,
        expectedOutcome: null,
        classificationStatus: "pending",
        segments: [],
        evidenceDigest: "a".repeat(64),
        authorization: {
          version: 1,
          authorizationClass: "qa_operator_explicit",
          authorizedAt: "2026-07-13T00:00:00.000Z",
          providerScope: "qnb-egypt",
          currencyScope: ["EGP", "USD"],
          messageFamilyScope: ["card_purchase"],
        },
        validationFindings: [],
        status: "draft",
      },
      navigateBack: jest.fn(() => true),
    };
    render(<QaSmsPatternIntakeScreen />);

    const headerProps = mockPageHeader.mock.calls.at(0)?.[0];
    expect(headerProps).toBeDefined();
    headerProps?.onBack();

    expect(mockHookResult.navigateBack).toHaveBeenCalledTimes(1);
    expect(mockHookResult.reset).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockSanitizedReview).toHaveBeenCalledWith(
      expect.objectContaining({ topInset: 24, bottomInset: 48 })
    );
  });

  it("renders nothing unless both Android development guards pass", () => {
    const { toJSON } = render(<QaSmsPatternIntakeScreen />);
    expect(toJSON()).toBeNull();
  });

  it("renders the guarded state without exposing raw content in export", () => {
    mockIsAvailable = true;
    mockHookResult = createHookResult("local_export");
    render(<QaSmsPatternIntakeScreen />);
    expect(screen.getByTestId("export-state")).toBeTruthy();
    expect(screen.queryByText("raw body")).toBeNull();
  });

  it("uses the compact selection title and wires the verified provider retry", () => {
    mockIsAvailable = true;
    mockHookResult = createHookResult("selection");

    render(<QaSmsPatternIntakeScreen />);

    expect(mockPageHeader).toHaveBeenCalledWith(
      expect.objectContaining({ title: "selection_title", subtitle: undefined })
    );
    expect(mockMessageList).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: "QNB EGYPT",
      })
    );
    const messageListProps = mockMessageList.mock.calls[0]?.[0];
    expect(messageListProps).toBeDefined();
    if (!messageListProps) throw new Error("message_list_props_missing");
    messageListProps.onRetry();
    expect(mockHookResult.retryMessages).toHaveBeenCalledTimes(1);
  });
});
