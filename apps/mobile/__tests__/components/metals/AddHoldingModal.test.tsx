import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

const mockCreateMetalHolding = jest.fn<Promise<void>, [unknown]>();
const mockOnClose = jest.fn();
const mockShowToast = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/services/metal-holding-service", () => ({
  createMetalHolding: async (data: unknown): Promise<void> => {
    await mockCreateMetalHolding(data);
  },
}));

import { AddHoldingModal } from "@/components/metals/AddHoldingModal";

describe("AddHoldingModal toast feedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateMetalHolding.mockResolvedValue(undefined);
  });

  it("shows a success toast after adding a holding", async () => {
    render(<AddHoldingModal visible onClose={mockOnClose} />);

    fireEvent.changeText(
      screen.getByPlaceholderText("name_placeholder"),
      "Ring"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("weight_placeholder"),
      "10"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("purchase_price_placeholder"),
      "25000"
    );
    fireEvent.press(screen.getByText("add_to_savings"));

    await waitFor(() => {
      expect(mockCreateMetalHolding).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "holding_created",
        message: "holding_created_message",
      });
    });
  });

  it("shows an error toast when adding a holding fails", async () => {
    mockCreateMetalHolding.mockRejectedValueOnce(
      new Error("Supabase insert failed")
    );
    render(<AddHoldingModal visible onClose={mockOnClose} />);

    fireEvent.changeText(
      screen.getByPlaceholderText("name_placeholder"),
      "Ring"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("weight_placeholder"),
      "10"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("purchase_price_placeholder"),
      "25000"
    );
    fireEvent.press(screen.getByText("add_to_savings"));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "error",
        title: "holding_create_failed",
        message: "error_save_failed",
      });
      expect(screen.queryByText("Supabase insert failed")).toBeNull();
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });
});
