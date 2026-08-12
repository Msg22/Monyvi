import { render, screen } from "@testing-library/react-native";

import { InstitutionLogoMark } from "@/components/institutions/InstitutionLogoMark";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const React = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(ReactNative.View, { testID: "logo-skeleton" });
  },
}));

describe("InstitutionLogoMark", () => {
  it("renders a bundled app logo without a transient loading skeleton", () => {
    const logo: InstitutionLogo = {
      format: "image",
      source: 2,
      appSource: 1,
    };

    render(<InstitutionLogoMark logo={logo} testID="institution-logo" />);

    expect(screen.getByTestId("institution-logo image")).toBeTruthy();
    expect(screen.queryByTestId("logo-skeleton")).toBeNull();
  });
});
