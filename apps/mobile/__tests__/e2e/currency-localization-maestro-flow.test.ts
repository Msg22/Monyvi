import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("currency localization Maestro journey", () => {
  function readMobileFile(path: string): string {
    return readFileSync(resolve(__dirname, "../../", path), "utf8");
  }

  it("switches to Arabic and verifies localized home, account, and transaction amounts", () => {
    const flow = readMobileFile(
      "e2e/maestro/localization/arabic-money-displays.yaml"
    );

    expect(flow).not.toContain("launchApp:");
    expect(flow).toContain('id: "settings-language-trigger"');
    expect(flow).toContain('id: "settings-language-option-ar"');
    expect(flow).toContain('id: "tab-home"');
    expect(flow).toContain('id: "home-net-worth-amount"');
    expect(flow).toContain('id: "tab-accounts"');
    expect(flow).toContain('"٢٬٥٠٠ جنيه مصري"');
    expect(flow).toContain('id: "tab-transactions"');
    expect(flow).toContain('"؜-١٢٥٫٠٠ جنيه مصري"');
  });

  it("keeps the production selectors stable", () => {
    const dropdown = readMobileFile("components/ui/Dropdown.tsx");
    const settings = readMobileFile("components/settings/SettingsSections.tsx");
    const tabBar = readMobileFile("components/tab-bar/CustomBottomTabBar.tsx");
    const netWorth = readMobileFile(
      "components/dashboard/TotalNetWorthCard.tsx"
    );

    expect(dropdown).toContain(
      "testID={testID ? `${testID}-trigger` : undefined}"
    );
    expect(dropdown).toMatch(
      /testID=\{\s*testID\s*\?\s*`\$\{testID\}-option-\$\{String\(item\.value\)\}`\s*:\s*undefined\s*\}/
    );
    expect(settings).toContain('testID="settings-language"');
    expect(tabBar).toContain(
      'testID={`tab-${routeName === "index" ? "home" : routeName}`}'
    );
    expect(netWorth).toContain('testID="home-net-worth-amount"');
  });
});
