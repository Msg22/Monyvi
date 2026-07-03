import React, { type ReactNode } from "react";
import { Platform } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

const mockRequestPermission = jest.fn<Promise<SmsPermissionStatus>, []>();
const mockOpenSettings = jest.fn<Promise<void>, []>();
const mockRouterBack = jest.fn<void, []>();
const mockRouterReplace = jest.fn<void, [string]>();
const mockStartScan = jest.fn<void, [unknown]>();
const mockSetTransactions = jest.fn<void, [readonly unknown[]]>();

let mockPermissionStatus: SmsPermissionStatus = "undetermined";

jest.mock("react-native/Libraries/Modal/Modal", () => {
  function MockModal({
    visible,
    children,
  }: {
    readonly visible: boolean;
    readonly children?: ReactNode;
  }): ReactNode {
    return visible ? children : null;
  }

  MockModal.displayName = "Modal";

  return { __esModule: true, default: MockModal };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockRouterBack,
    canGoBack: () => true,
    push: jest.fn(),
    replace: mockRouterReplace,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@/hooks/useSmsPermission", () => ({
  useSmsPermission: () => ({
    status: mockPermissionStatus,
    isLoading: false,
    requestPermission: mockRequestPermission,
    openSettings: mockOpenSettings,
  }),
}));

jest.mock("@/hooks/useSmsScan", () => ({
  useSmsScan: () => ({
    status: "idle",
    progress: null,
    result: null,
    transactions: [],
    error: null,
    startScan: mockStartScan,
  }),
}));

jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({
    lastSyncTimestamp: null,
  }),
}));

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    setTransactions: mockSetTransactions,
    scanMode: "incremental",
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useAllCategories: () => ({
    categories: [],
    isLoading: false,
  }),
}));

jest.mock("@/services/sms-sync-service", () => ({
  loadExistingSmsFingerprints: jest.fn(() => Promise.resolve(new Set())),
}));

jest.mock("@/utils/category-tree-source", () => ({
  toCategoryTreeSources: jest.fn(() => []),
}));

jest.mock("@/components/sms-sync/SmsScanProgress", () => ({
  SmsScanProgress: () => null,
}));

jest.mock("@monyvi/logic", () => ({
  SUPPORTED_CURRENCIES: [{ code: "EGP" }],
}));

import SmsScanScreen from "@/app/(private)/sms-scan";

describe("SmsScanScreen permission rationale", () => {
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionStatus = "undetermined";
    mockRequestPermission.mockResolvedValue("granted");
    mockOpenSettings.mockResolvedValue();
  });

  it("shows an app-side rationale before requesting first-time SMS permission", async () => {
    const screen = render(<SmsScanScreen />);

    expect(
      await screen.findByText("sms_sync_permission_request_title")
    ).toBeTruthy();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockStartScan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the blocked recovery CTA instead of requesting SMS permission", async () => {
    mockPermissionStatus = "blocked";

    const screen = render(<SmsScanScreen />);

    expect(
      await screen.findByText("sms_sync_permission_blocked_title")
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("permission-modal-primary"));

    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
