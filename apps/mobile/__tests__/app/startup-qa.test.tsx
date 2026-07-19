import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

const mockRemoveLocalMarketRatesForQa = jest.fn();

jest.mock("@monyvi/db", () => ({ database: {} }));

jest.mock("@/services/dev/startup-qa-fixtures", () => ({
  removeLocalMarketRatesForQa: (...args: unknown[]): Promise<number> =>
    mockRemoveLocalMarketRatesForQa(...args) as Promise<number>,
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import StartupQaScreen from "../../app/(private)/startup-qa";

describe("StartupQaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("removes local rates while clearly confirming that the profile is preserved", async () => {
    mockRemoveLocalMarketRatesForQa.mockResolvedValue(2);
    render(<StartupQaScreen />);

    fireEvent.press(screen.getByLabelText("Remove local market rates"));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Removed 2 local market-rate rows. Your profile was preserved."
        )
      ).toBeTruthy()
    );
  });

  it("shows actionable fixture guidance before deletion", () => {
    render(<StartupQaScreen />);

    expect(
      screen.getByText(
        "Turn off Wi-Fi and mobile data before removing rates. Then force-stop and reopen Monyvi."
      )
    ).toBeTruthy();
  });

  it("shows an actionable diagnostic message when local deletion fails", async () => {
    mockRemoveLocalMarketRatesForQa.mockRejectedValue(
      new Error("Database unavailable")
    );
    render(<StartupQaScreen />);

    fireEvent.press(screen.getByLabelText("Remove local market rates"));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not remove local market rates. Check Metro logs."
        )
      ).toBeTruthy()
    );
  });
});
