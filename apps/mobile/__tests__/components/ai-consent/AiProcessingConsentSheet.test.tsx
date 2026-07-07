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

function getClassName(element: unknown): string {
  const className = (
    element as { readonly props: { readonly className?: unknown } }
  ).props.className;

  return typeof className === "string" ? className : "";
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

  it("renders the SMS import consent sheet with the approved centered layout", () => {
    render(
      <AiProcessingConsentSheet
        visible
        variant="sms-permission-with-ai-consent"
        onContinue={jest.fn()}
        onNotNow={jest.fn()}
        onPrivacyDetails={jest.fn()}
      />
    );

    expect(getClassName(screen.getByTestId("sms-consent-hero-icon"))).toContain(
      "self-center"
    );
    expect(getClassName(screen.getByTestId("sms-consent-title"))).toContain(
      "text-center"
    );
    expect(getClassName(screen.getByTestId("sms-consent-body"))).toContain(
      "text-center"
    );
    expect(
      getClassName(screen.getByTestId("sms-consent-row-sms-access"))
    ).toContain("border");
    expect(
      getClassName(screen.getByTestId("sms-consent-row-ai-processing"))
    ).toContain("border");
    expect(screen.getByTestId("sms-consent-settings-note")).toBeTruthy();
    expect(screen.queryByText("ai_consent_privacy_details")).toBeNull();
    expect(getClassName(screen.getByText("ai_consent_not_now"))).toContain(
      "text-nileGreen-600"
    );
  });
});
