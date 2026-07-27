import { render, screen } from "@testing-library/react-native";
import React, { type ReactNode } from "react";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    children,
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({ title }: { readonly title: string }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.Text>{title}</ReactNative.Text>;
  },
}));

import PrivacyDetailsScreen from "@/app/(private)/privacy-details";

describe("PrivacyDetailsScreen", () => {
  it("separates temporary local SMS review storage from AI processing", () => {
    render(<PrivacyDetailsScreen />);

    expect(screen.getByText("privacy_details_title")).toBeTruthy();
    expect(screen.getByText("privacy_sms_drafts_title")).toBeTruthy();
    expect(screen.getByText("privacy_sms_drafts_retention")).toBeTruthy();
    expect(screen.getByText("privacy_sms_drafts_not_synced")).toBeTruthy();
    expect(screen.getByText("privacy_ai_title")).toBeTruthy();
  });
});
