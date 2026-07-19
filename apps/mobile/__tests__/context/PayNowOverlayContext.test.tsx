import type { RecurringPayment } from "@monyvi/db";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import {
  PayNowOverlayProvider,
  usePayNowOverlay,
} from "@/context/PayNowOverlayContext";

const payment = {
  id: "payment-1",
  name: "Electricity",
} as unknown as RecurringPayment;

interface WrapperProps {
  readonly children: ReactNode;
}

function wrapper({ children }: WrapperProps): ReactElement {
  return <PayNowOverlayProvider>{children}</PayNowOverlayProvider>;
}

describe("PayNowOverlayContext", () => {
  it("opens the overlay for a payment and clears it when closed", () => {
    const { result } = renderHook(() => usePayNowOverlay(), { wrapper });

    act(() => result.current.openPayNow(payment));

    expect(result.current.selectedPayment).toBe(payment);
    expect(result.current.isPayNowVisible).toBe(true);

    act(() => result.current.closePayNow());

    expect(result.current.selectedPayment).toBeNull();
    expect(result.current.isPayNowVisible).toBe(false);
  });

  it("rejects consumers outside the provider", () => {
    expect(() => renderHook(() => usePayNowOverlay())).toThrow(
      "usePayNowOverlay must be used within a PayNowOverlayProvider"
    );
  });
});
