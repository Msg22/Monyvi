import { Platform, type PlatformOSType } from "react-native";

const mockReconcileLiveDetectionPreference = jest.fn<Promise<boolean>, []>();
const mockSetLiveDetectionEnabled = jest.fn<Promise<void>, [boolean]>();
const mockSetAutoConfirm = jest.fn<Promise<void>, [boolean]>();
const mockGetAiProcessingConsentStatus = jest.fn<
  Promise<{ isConsented: boolean }>,
  []
>();
const mockStartSmsListener = jest.fn<void, []>();
const mockStopSmsListener = jest.fn<void, []>();

jest.mock("@/services/sms-live-detection-handler", () => ({
  reconcileLiveDetectionPreference: (): Promise<boolean> =>
    mockReconcileLiveDetectionPreference(),
  setLiveDetectionEnabled: (enabled: boolean): Promise<void> =>
    mockSetLiveDetectionEnabled(enabled),
  setAutoConfirm: (enabled: boolean): Promise<void> =>
    mockSetAutoConfirm(enabled),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{ isConsented: boolean }> =>
    mockGetAiProcessingConsentStatus(),
}));

jest.mock("@/services/sms-live-listener-service", () => ({
  startSmsListener: (): void => mockStartSmsListener(),
  stopSmsListener: (): void => mockStopSmsListener(),
}));

import { startConsentAwareLiveSmsListenerIfEnabled } from "@/services/sms-live-startup-service";

const originalPlatformOS = Platform.OS;

function setPlatformOS(os: PlatformOSType): void {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

describe("startConsentAwareLiveSmsListenerIfEnabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS("android");
    mockReconcileLiveDetectionPreference.mockResolvedValue(true);
    mockSetLiveDetectionEnabled.mockResolvedValue(undefined);
    mockSetAutoConfirm.mockResolvedValue(undefined);
    mockGetAiProcessingConsentStatus.mockResolvedValue({ isConsented: true });
  });

  afterAll(() => {
    setPlatformOS(originalPlatformOS);
  });

  it("starts the listener when live detection can run and AI consent is active", async () => {
    await startConsentAwareLiveSmsListenerIfEnabled();

    expect(mockReconcileLiveDetectionPreference).toHaveBeenCalledTimes(1);
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(1);
    expect(mockStartSmsListener).toHaveBeenCalledTimes(1);
    expect(mockStopSmsListener).not.toHaveBeenCalled();
  });

  it("stops the listener without reading consent when live detection cannot run", async () => {
    mockReconcileLiveDetectionPreference.mockResolvedValueOnce(false);

    await startConsentAwareLiveSmsListenerIfEnabled();

    expect(mockGetAiProcessingConsentStatus).not.toHaveBeenCalled();
    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(mockStopSmsListener).toHaveBeenCalledTimes(1);
  });

  it("disables live detection and stops the listener when AI consent is missing", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      isConsented: false,
    });

    await startConsentAwareLiveSmsListenerIfEnabled();

    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(mockStopSmsListener).toHaveBeenCalledTimes(1);
  });

  it("stops the listener when the AI consent lookup fails", async () => {
    const consentError = new Error("profile unavailable");
    mockGetAiProcessingConsentStatus.mockRejectedValueOnce(consentError);

    await expect(startConsentAwareLiveSmsListenerIfEnabled()).rejects.toThrow(
      consentError
    );

    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(mockStopSmsListener).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside Android", async () => {
    setPlatformOS("ios");

    await startConsentAwareLiveSmsListenerIfEnabled();

    expect(mockReconcileLiveDetectionPreference).not.toHaveBeenCalled();
    expect(mockGetAiProcessingConsentStatus).not.toHaveBeenCalled();
    expect(mockStartSmsListener).not.toHaveBeenCalled();
    expect(mockStopSmsListener).not.toHaveBeenCalled();
  });
});
