import React, { type ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";

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

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View {...props} />;
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("AiProcessingConsentSheet", () => {
  it("submits Continue only once while consent is being granted", async () => {
    const grantConsent = createDeferred();
    const onContinue = jest.fn(() => grantConsent.promise);

    render(
      <AiProcessingConsentSheet
        visible
        variant="ai-consent"
        onContinue={onContinue}
        onNotNow={jest.fn()}
        onPrivacyDetails={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("ai-consent-continue"));
    fireEvent.press(screen.getByTestId("ai-consent-continue"));

    expect(onContinue).toHaveBeenCalledTimes(1);
    grantConsent.resolve();

    await waitFor(() => {
      expect(screen.getByTestId("ai-consent-continue")).toBeTruthy();
    });
  });

  it("blocks secondary actions while Continue is submitting", () => {
    const grantConsent = createDeferred();
    const onContinue = jest.fn(() => grantConsent.promise);
    const onNotNow = jest.fn();
    const onPrivacyDetails = jest.fn();

    render(
      <AiProcessingConsentSheet
        visible
        variant="ai-consent"
        onContinue={onContinue}
        onNotNow={onNotNow}
        onPrivacyDetails={onPrivacyDetails}
      />
    );

    fireEvent.press(screen.getByTestId("ai-consent-continue"));
    fireEvent.press(screen.getByTestId("ai-consent-not-now"));
    fireEvent.press(screen.getByText("ai_consent_privacy_details"));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onNotNow).not.toHaveBeenCalled();
    expect(onPrivacyDetails).not.toHaveBeenCalled();
  });
});
