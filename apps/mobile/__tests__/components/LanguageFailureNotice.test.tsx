import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { LanguageFailureNotice } from "@/components/LanguageFailureNotice";
import type { LanguageSnapshot } from "@/services/language-coordinator";

const mockState: LanguageSnapshot = {
  scope: "public",
  phase: "error",
  language: "en",
  errorCode: "direction-failed",
};
const mockShowToast = jest.fn();
const mockHide = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
jest.mock("@/hooks/useLanguageRuntime", (): object => ({
  useLanguageState: (): LanguageSnapshot => mockState,
}));
jest.mock("@/context/AuthContext", (): object => ({
  useAuth: (): object => ({ user: null, isLoading: false }),
}));
jest.mock("@/hooks/useLocaleStartup", (): object => ({
  PUBLIC_LANGUAGE_SCOPE: "public",
}));
jest.mock("@/components/ui/Toast", (): object => ({
  useToast: (): object => ({ showToast: mockShowToast }),
}));
jest.mock("expo-splash-screen", (): object => ({
  hideAsync: (): Promise<void> => mockHide(),
}));
jest.mock("react-i18next", (): object => ({
  useTranslation: (): object => ({ t: (key: string): string => key }),
}));

it("waits until splash is hidden then warns once with reopen guidance", async (): Promise<void> => {
  let hide: (() => void) | undefined;
  mockHide.mockImplementationOnce(
    (): Promise<void> =>
      new Promise((resolve): void => {
        hide = resolve;
      })
  );
  const { rerender } = render(<LanguageFailureNotice />);
  expect(mockShowToast).not.toHaveBeenCalled();
  act((): void => {
    hide?.();
  });
  await waitFor(() =>
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        message: "language_direction_reopen",
        dismissible: true,
      })
    )
  );
  rerender(<LanguageFailureNotice />);
  expect(mockShowToast).toHaveBeenCalledTimes(1);
});
