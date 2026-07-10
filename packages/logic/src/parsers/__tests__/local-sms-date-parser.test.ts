import { parseLocalSmsMessageDate } from "../local-sms-date-parser";

describe("parseLocalSmsMessageDate", () => {
  it("uses the previous year for yearless December dates received after New Year", () => {
    const receivedAt = new Date(2027, 0, 1, 0, 5).getTime();

    const parsed = parseLocalSmsMessageDate(
      "Purchase on 31/12 23:50",
      receivedAt
    );

    expect(parsed).toEqual(new Date(2026, 11, 31, 23, 50));
  });

  it("keeps a small same-year clock skew for yearless dates", () => {
    const receivedAt = new Date(2027, 0, 1, 23, 45).getTime();

    const parsed = parseLocalSmsMessageDate(
      "Purchase on 01/01 23:50",
      receivedAt
    );

    expect(parsed).toEqual(new Date(2027, 0, 1, 23, 50));
  });
});
