import { readFileSync } from "node:fs";
import path from "node:path";

const DASHBOARD_COMPONENTS_DIR = path.resolve(
  __dirname,
  "../../../components/dashboard"
);

function readDashboardComponent(fileName: string): string {
  return readFileSync(path.join(DASHBOARD_COMPONENTS_DIR, fileName), "utf8");
}

describe("dashboard NativeWind and RTL safety", () => {
  it("keeps the TopNav currency loading opacity out of TouchableOpacity className", () => {
    const source = readDashboardComponent("TopNav.tsx");

    expect(source).not.toContain('isCurrencyLoading ? "opacity-50"');
    expect(source).toContain("opacity: isCurrencyLoading ? 0.5 : 1");
  });

  it("uses RTL-aware start-side spacing and border on the SMS import card", () => {
    const source = readDashboardComponent("SmsImportStatusCard.tsx");

    expect(source).toContain("border-s-2");
    expect(source).toContain("border-s-nileGreen-500");
    expect(source).toContain("flex-1 ms-3");
    expect(source).not.toContain("border-l-2");
    expect(source).not.toContain("border-l-nileGreen-500");
    expect(source).not.toContain("flex-1 ml-3");
  });
});
