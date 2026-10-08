import { render, screen, userEvent } from "@testing-library/react-native";
import React from "react";

const mockRouterReplace = jest.fn();

interface MockRouteParams {
  readonly transactions: string;
  readonly transcript: string;
  readonly originalTranscript: string;
  readonly detectedLanguage: string;
  readonly originTabIndex: string;
}

let mockRouteParams: MockRouteParams = {
  transactions: "",
  transcript: "",
  originalTranscript: "",
  detectedLanguage: "en",
  originTabIndex: "2",
};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock("@/services/batch-create-transactions", () => ({
  batchCreateTransactions: jest.fn(),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({
    rightAction,
  }: {
    readonly rightAction?: {
      readonly onPress: () => void;
    };
  }): React.JSX.Element => {
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <Pressable testID="voice-review-retry" onPress={rightAction?.onPress}>
        <Text>Retry</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/transaction-review/TransactionReview", () => ({
  TransactionReview: ({
    onDiscard,
  }: {
    readonly onDiscard: () => void;
  }): React.JSX.Element => {
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <Pressable testID="voice-review-discard" onPress={onDiscard}>
        <Text>Discard</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: ({
    visible,
    onConfirm,
  }: {
    readonly visible: boolean;
    readonly onConfirm: () => void;
  }): React.JSX.Element | null => {
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");

    if (!visible) return null;

    return (
      <Pressable testID="confirm-discard" onPress={onConfirm}>
        <Text>Confirm discard</Text>
      </Pressable>
    );
  },
}));

import VoiceReviewScreen from "@/app/(private)/voice-review";

function makeReviewTransaction(): Record<string, unknown> {
  return {
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    source: "VOICE",
    date: "2026-10-07T12:00:00.000Z",
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.9,
    originLabel: "Voice",
  };
}

function renderReview(originTabIndex: string): ReturnType<typeof render> {
  mockRouteParams = {
    transactions: JSON.stringify([makeReviewTransaction()]),
    transcript: "",
    originalTranscript: "",
    detectedLanguage: "en",
    originTabIndex,
  };

  return render(<VoiceReviewScreen />);
}

describe("Voice review navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves the originating tab when review is discarded", async () => {
    const user = userEvent.setup();
    renderReview("3");

    await user.press(screen.getByTestId("voice-review-discard"));
    await user.press(await screen.findByTestId("confirm-discard"));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/(private)/(tabs)/metals");
  });

  it("routes Retry to unified Voice mode with one retry intent", async () => {
    const user = userEvent.setup();
    renderReview("3");

    await user.press(screen.getByTestId("voice-review-retry"));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: "/add-transaction",
      params: {
        mode: "voice",
        retry: "true",
      },
    });
  });
});
