import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Add Transaction recurring date error handling", () => {
  it("maps recurring invalid start-date failures to the established localized date-range copy", () => {
    const source = readFileSync(
      resolve(__dirname, "../../app/(private)/add-transaction.tsx"),
      "utf8"
    );

    expect(source).toContain(
      "message === RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE"
    );
    expect(source).toContain('return t("due_payment_date_range")');
  });
});
