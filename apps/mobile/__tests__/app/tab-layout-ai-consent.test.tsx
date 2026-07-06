import React from "react";
import {
  Pressable as MockPressable,
  Text as MockText,
  View as MockView,
} from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

let focusCallback: (() => void) | null = null;
const mockRouterPush = jest.fn<void, [string]>();
const mockSetParams = jest.fn<void, [Record<string, unknown>]>();
const mockStartVoiceFlow = jest.fn<Promise<void>, [unknown?]>();
const mockGrantConsent = jest.fn<Promise<void>, []>();
let mockIsAiConsented = false;
let mockIsAiConsentLoading = false;
let mockRetryParam: string | undefined;
let latestVoiceFlowOptions:
  | {
      readonly autoStart: boolean;
      readonly canAutoStart: boolean;
      readonly ensureAiProcessingConsent: () => boolean;
    }
  | undefined;

jest.mock("expo-router", () => {
  function Tabs({
    children,
    tabBar,
  }: {
    readonly children?: React.ReactNode;
    readonly tabBar?: (props: Record<string, unknown>) => React.ReactNode;
  }): React.ReactElement {
    return (
      <MockView>
        {children}
        {tabBar?.({})}
      </MockView>
    );
  }

  Tabs.Screen = function Screen(): null {
    return null;
  };

  return {
    Tabs,
    useFocusEffect: (callback: () => void): void => {
      focusCallback = callback;
    },
    useLocalSearchParams: () => ({ retry: mockRetryParam }),
    useRouter: () => ({
      push: mockRouterPush,
      setParams: mockSetParams,
    }),
  };
});

jest.mock("@/components/fab", () => ({
  QuickActionFab: () => null,
}));

jest.mock("@/components/tab-bar/CustomBottomTabBar", () => ({
  CustomBottomTabBar: ({ onMicPress }: { readonly onMicPress: () => void }) => {
    return (
      <MockPressable testID="tab-mic" onPress={onMicPress}>
        <MockText>Mic</MockText>
      </MockPressable>
    );
  },
}));

jest.mock("@/components/voice/VoiceRecordingOverlay", () => ({
  VoiceRecordingOverlay: () => null,
}));

jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: ({
    visible,
    onContinue,
    onPrivacyDetails,
  }: {
    readonly visible: boolean;
    readonly onContinue: () => void | Promise<void>;
    readonly onPrivacyDetails: () => void;
  }): React.ReactElement | null => {
    return visible ? (
      <MockView>
        <MockPressable testID="voice-consent-continue" onPress={onContinue}>
          <MockText>Continue</MockText>
        </MockPressable>
        <MockPressable testID="voice-privacy-details" onPress={onPrivacyDetails}>
          <MockText>Privacy details</MockText>
        </MockPressable>
      </MockView>
    ) : null;
  },
}));

jest.mock("@/context/MicButtonRefContext", () => ({
  MicButtonRefProvider: ({ children }: { readonly children: React.ReactNode }) =>
    children,
  useMicButtonRef: () => null,
}));

jest.mock("@/context/MicTooltipContext", () => ({
  MicTooltipProvider: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP" }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [] }),
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ accounts: [] }),
}));

jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    isConsented: mockIsAiConsented,
    isLoading: mockIsAiConsentLoading,
    grantConsent: mockGrantConsent,
  }),
}));

jest.mock("@/hooks/useVoiceTransactionFlow", () => ({
  useVoiceTransactionFlow: (options: {
    readonly autoStart: boolean;
    readonly canAutoStart: boolean;
    readonly ensureAiProcessingConsent: () => boolean;
  }) => {
    latestVoiceFlowOptions = options;
    return {
      flowStatus: "idle",
      isOverlayVisible: false,
      durationMs: 0,
      errorMessage: null,
      startFlow: (args?: unknown) => {
        mockStartVoiceFlow(args);
        options.ensureAiProcessingConsent();
        return Promise.resolve();
      },
      submitRecording: jest.fn(),
      discardRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      retryRecording: jest.fn(),
    };
  },
}));

jest.mock("@/services/voice-entry-service", () => ({
  registerVoiceEntry: jest.fn(),
  unregisterVoiceEntry: jest.fn(),
}));

jest.mock("@/utils/category-tree-source", () => ({
  toCategoryTreeSources: () => [],
}));

jest.mock("@monyvi/logic", () => ({
  buildCategoryTree: () => [],
}));

import TabLayout from "@/app/(private)/(tabs)/_layout";

describe("TabLayout AI consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = null;
    mockIsAiConsented = false;
    mockIsAiConsentLoading = false;
    mockRetryParam = undefined;
    latestVoiceFlowOptions = undefined;
    mockGrantConsent.mockResolvedValue();
    mockStartVoiceFlow.mockResolvedValue();
  });

  it("reopens voice consent after returning from privacy details", () => {
    render(<TabLayout />);

    fireEvent.press(screen.getByTestId("tab-mic"));
    expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();

    fireEvent.press(screen.getByTestId("voice-privacy-details"));
    expect(mockRouterPush).toHaveBeenCalledWith("/ai-privacy-details");
    expect(screen.queryByTestId("voice-privacy-details")).toBeNull();

    act(() => {
      focusCallback?.();
    });

    expect(screen.getByTestId("voice-privacy-details")).toBeTruthy();
  });

  it("keeps voice consent visible when granting consent fails", async () => {
    mockGrantConsent.mockRejectedValue(new Error("profile unavailable"));
    render(<TabLayout />);

    fireEvent.press(screen.getByTestId("tab-mic"));
    fireEvent.press(screen.getByTestId("voice-consent-continue"));

    await waitFor(() => expect(mockGrantConsent).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("voice-consent-continue")).toBeTruthy();
    expect(mockStartVoiceFlow).toHaveBeenCalledTimes(1);
  });

  it("preserves retry auto-start until AI consent finishes loading", () => {
    mockRetryParam = "true";
    mockIsAiConsentLoading = true;
    const { rerender } = render(<TabLayout />);

    expect(latestVoiceFlowOptions).toMatchObject({
      autoStart: true,
      canAutoStart: false,
    });
    expect(mockSetParams).not.toHaveBeenCalled();

    mockIsAiConsentLoading = false;
    rerender(<TabLayout />);

    expect(latestVoiceFlowOptions).toMatchObject({
      autoStart: true,
      canAutoStart: true,
    });
    expect(mockSetParams).toHaveBeenCalledWith({ retry: undefined });
  });
});
