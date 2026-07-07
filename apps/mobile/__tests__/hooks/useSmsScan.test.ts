import { act, renderHook } from "@testing-library/react-native";
import { useSmsScan } from "@/hooks/useSmsScan";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";

const mockScanAndParseSms = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("@/services/sms-sync-service", () => ({
  scanAndParseSms: (...args: readonly unknown[]): unknown =>
    mockScanAndParseSms(...args),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const smsScanOptions = {
  aiContext: {
    categories: [],
    supportedCurrencies: ["EGP"],
  } satisfies ParseSmsContext,
  existingFingerprints: new Set<string>(),
};

describe("useSmsScan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats an aborted scan as cancellation instead of a failure", async () => {
    const abortError = new Error("SMS scan aborted");
    abortError.name = "AbortError";
    mockScanAndParseSms.mockRejectedValueOnce(abortError);
    const { result } = renderHook(() => useSmsScan());

    await act(async () => {
      await result.current.startScan(smsScanOptions);
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("still logs unexpected scan failures", async () => {
    const failure = new Error("Native SMS read failed");
    mockScanAndParseSms.mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useSmsScan());

    await act(async () => {
      await result.current.startScan(smsScanOptions);
    });

    expect(mockLoggerError).toHaveBeenCalledWith("smsScan.failed", failure);
    expect(result.current.status).toBe("error");
  });
});
