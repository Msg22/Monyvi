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
  });

  it("does not bury the overlay inside UpcomingPayments' clipped card", () => {
    const upcomingPaymentsSource = fs.readFileSync(
      path.join(mobileRoot, "components/dashboard/UpcomingPayments.tsx"),
      "utf8"
    );

    expect(upcomingPaymentsSource).not.toContain("<PayNowModal");
  });
});
