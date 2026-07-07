import { act, renderHook } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";

const mockPush = jest.fn();
const mockRecorderStart = jest.fn();
const mockRecorderPause = jest.fn();
const mockRecorderResume = jest.fn();
const mockRecorderStop = jest.fn();
const mockRecorderDiscard = jest.fn();
const mockRecorderReset = jest.fn();
const mockRequestPermission = jest.fn();
const mockParseVoiceWithAi = jest.fn();
const mockOpenSettings = jest.fn();

const recorderState = {
  status: "idle",
  durationMs: 0,
  isRecording: false,
  audioUri: null,
  hasPermission: false,
};

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]): void => {
      mockPush(...args);
    },
  },
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    ...recorderState,
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: mockRecorderReset,
    requestPermission: mockRequestPermission,
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (...args: unknown[]): unknown => mockParseVoiceWithAi(...args),
  isVoiceParserError: (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    !("transactions" in value),
}));

function renderVoiceFlow(): ReturnType<typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, never>> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "",
      accounts: [],
      categoryRecords: [],
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, "openSettings").mockImplementation(mockOpenSettings);
  recorderState.status = "idle";
  recorderState.durationMs = 0;
  recorderState.isRecording = false;
  recorderState.audioUri = null;
  recorderState.hasPermission = false;
  mockRecorderStart.mockResolvedValue(undefined);
  mockRecorderDiscard.mockResolvedValue(undefined);
  mockRequestPermission.mockResolvedValue(false);
  mockOpenSettings.mockResolvedValue(undefined);
});

describe("useVoiceTransactionFlow", () => {
  it("does not start recording from retry when microphone permission is still denied", async (): Promise<void> => {
    const { result } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toContain("Microphone permission");
    expect(result.current.isMicrophonePermissionError).toBe(true);
    expect(mockRecorderStart).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toContain("Microphone permission");
    expect(result.current.isMicrophonePermissionError).toBe(true);
    expect(mockRecorderStart).not.toHaveBeenCalled();
  });

  it("opens device settings for microphone permission recovery", async (): Promise<void> => {
    const { result } = renderVoiceFlow();

    await act(async () => {
      await result.current.openMicrophoneSettings();
    });

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
