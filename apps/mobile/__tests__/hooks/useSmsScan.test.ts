import { act, renderHook } from "@testing-library/react-native";
import { useSmsScan } from "@/hooks/useSmsScan";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";

const mockScanAndParseSms = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("@/services/sms-sync-service", () => ({
  scanAndParseSms: (...args: readonly unknown[]): unknown =>
    mockScanAndParseSms(...args),
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@/services/authenticated-edge-function-service", () => ({
  isEdgeFunctionAuthenticationError: (error: unknown): boolean =>
    error instanceof Error &&
    error.name === "EdgeFunctionAuthenticationRequiredError",
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
  scanKind: "initial" as const,
  aiContext: {
    categories: [],
    supportedCurrencies: ["EGP"],
  } satisfies ParseSmsContext,
};

function createAiConsentRequiredError(): Error {
  const error = new Error("AI processing consent required");
  error.name = "AiConsentRequiredError";
  return error;
}

function createEdgeFunctionAuthenticationError(): Error {
  const error = new Error("Authenticated Edge Function session required");
  error.name = "EdgeFunctionAuthenticationRequiredError";
  return error;
}

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

  it("surfaces server-side consent rejection without generic scan failure", async () => {
    mockScanAndParseSms.mockRejectedValueOnce(createAiConsentRequiredError());
    const { result } = renderHook(() => useSmsScan());

    await act(async () => {
      await result.current.startScan(smsScanOptions);
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("consent_required");
    expect(result.current.error).toBeNull();
  });

  it("lets the auth shell recover an invalid Edge session without a scan error", async () => {
    mockScanAndParseSms.mockRejectedValueOnce(
      createEdgeFunctionAuthenticationError()
    );
    const { result } = renderHook(() => useSmsScan());

    await act(async () => {
      await result.current.startScan(smsScanOptions);
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});
