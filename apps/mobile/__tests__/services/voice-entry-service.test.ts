const mockRouterPush = jest.fn<void, [string]>();
const mockLoggerWarn = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (href: string): void => mockRouterPush(href),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: (message: string, ...context: readonly unknown[]): void => {
      mockLoggerWarn(message, ...context);
    },
  },
}));

import { openVoiceEntry } from "@/services/voice-entry-service";

describe("voice-entry-service unified Add Transaction navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens the unified Add Transaction route in Voice mode", () => {
    openVoiceEntry();

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/add-transaction?mode=voice");
  });
});
