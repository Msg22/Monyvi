import fs from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(__dirname, "../../..");

describe("Pay Now overlay placement", () => {
  it("renders the full-screen overlay from the tab layout above tab controls", () => {
    const tabLayoutSource = fs.readFileSync(
      path.join(mobileRoot, "app/(private)/(tabs)/_layout.tsx"),
      "utf8"
    );
    const dashboardSource = fs.readFileSync(
      path.join(mobileRoot, "app/(private)/(tabs)/index.tsx"),
      "utf8"
    );
    const tabsEnd = tabLayoutSource.indexOf("</Tabs>");
    const modalPosition = tabLayoutSource.indexOf("<PayNowModal");

    expect(modalPosition).toBeGreaterThan(tabsEnd);
    expect(dashboardSource).not.toContain("<PayNowModal");
    expect(tabLayoutSource).toContain(
      "accessibilityElementsHidden={isPayNowVisible}"
    );
    expect(tabLayoutSource).toContain(
      'isPayNowVisible ? "no-hide-descendants" : "auto"'
    );
  });

  it("does not bury the overlay inside UpcomingPayments' clipped card", () => {
    const upcomingPaymentsSource = fs.readFileSync(
      path.join(mobileRoot, "components/dashboard/UpcomingPayments.tsx"),
      "utf8"
    );

    expect(upcomingPaymentsSource).not.toContain("<PayNowModal");
  });

  it("uses NativeWind for static overlay and backdrop styling", () => {
    const payNowModalSource = fs.readFileSync(
      path.join(
        mobileRoot,
        "components/dashboard/upcoming-payments/PayNowModal.tsx"
      ),
      "utf8"
    );

    expect(payNowModalSource).not.toContain("StyleSheet");
    expect(payNowModalSource).toContain(
      'className="absolute inset-0 z-[999] items-center justify-center px-5"'
    );
    expect(payNowModalSource).toContain(
      'className="absolute inset-0 bg-black/60"'
    );
  });
});
