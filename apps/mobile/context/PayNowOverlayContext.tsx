import type { RecurringPayment } from "@monyvi/db";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface PayNowOverlayContextValue {
  readonly selectedPayment: RecurringPayment | null;
  readonly isPayNowVisible: boolean;
  readonly openPayNow: (payment: RecurringPayment) => void;
  readonly closePayNow: () => void;
}

interface PayNowOverlayProviderProps {
  readonly children: React.ReactNode;
}

const PayNowOverlayContext = createContext<PayNowOverlayContextValue | null>(
  null
);

export function PayNowOverlayProvider({
  children,
}: PayNowOverlayProviderProps): React.JSX.Element {
  const [selectedPayment, setSelectedPayment] =
    useState<RecurringPayment | null>(null);
  const [isPayNowVisible, setIsPayNowVisible] = useState(false);

  const openPayNow = useCallback((payment: RecurringPayment): void => {
    setSelectedPayment(payment);
    setIsPayNowVisible(true);
  }, []);

  const closePayNow = useCallback((): void => {
    setIsPayNowVisible(false);
    setSelectedPayment(null);
  }, []);

  const value = useMemo<PayNowOverlayContextValue>(
    () => ({
      selectedPayment,
      isPayNowVisible,
      openPayNow,
      closePayNow,
    }),
    [closePayNow, isPayNowVisible, openPayNow, selectedPayment]
  );

  return (
    <PayNowOverlayContext.Provider value={value}>
      {children}
    </PayNowOverlayContext.Provider>
  );
}

export function usePayNowOverlay(): PayNowOverlayContextValue {
  const context = useContext(PayNowOverlayContext);

  if (!context) {
    throw new Error(
      "usePayNowOverlay must be used within a PayNowOverlayProvider"
    );
  }

  return context;
}
