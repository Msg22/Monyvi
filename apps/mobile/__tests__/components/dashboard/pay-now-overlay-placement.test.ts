import fs from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(__dirname, "../../..");

describe("Pay Now overlay placement", () => {
  it("renders the full-screen overlay outside the dashboard ScrollView", () => {
    const dashboardSource = fs.readFileSync(
      path.join(mobileRoot, "app/(private)/(tabs)/index.tsx"),
      "utf8"
    );
    const scrollViewEnd = dashboardSource.lastIndexOf("</ScrollView>");
    const modalPosition = dashboardSource.indexOf("<PayNowModal");

    expect(modalPosition).toBeGreaterThan(scrollViewEnd);
  });

  it("does not bury the overlay inside UpcomingPayments' clipped card", () => {
    const upcomingPaymentsSource = fs.readFileSync(
      path.join(mobileRoot, "components/dashboard/UpcomingPayments.tsx"),
      "utf8"
    );

    expect(upcomingPaymentsSource).not.toContain("<PayNowModal");
  });
});
