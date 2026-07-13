import type { RecurringPayment } from "@monyvi/db";
import { act, renderHook } from "@testing-library/react-native";
import { usePaymentSubmission } from "@/hooks/usePaymentSubmission";

const mockSubmitRecurringPayment = jest.fn();

jest.mock("@/services/recurring-payment-service", () => ({
  submitRecurringPayment: (params: unknown): unknown =>
    mockSubmitRecurringPayment(params),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: jest.fn(),
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

const payment = {
  id: "payment-1",
  name: "Electricity",
  currency: "EGP",
} as unknown as RecurringPayment;

describe("usePaymentSubmission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitRecurringPayment.mockResolvedValue(undefined);
  });

  it("rejects submission before scheduling a write when accountId is null", () => {
    const { result } = renderHook(() =>
      usePaymentSubmission({
        payment,
        accountId: null,
        onSuccess: jest.fn(),
        onClose: jest.fn(),
      })
    );

    act(() => {
      result.current.submit("250");
    });

    expect(result.current.amountError).toBe("");
    expect(mockSubmitRecurringPayment).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });
});
