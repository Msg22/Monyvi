jest.mock("../../i18n", () => ({
  __esModule: true,
  default: {
    language: "en",
    t: (key: string, values?: { readonly count?: number }): string => {
      if (key === "common:due_today") return "Due today";
      if (key === "common:due_tomorrow") return "Due tomorrow";
      if (key === "common:due_in_days") return `Due in ${values?.count} days`;
      if (key === "common:due_overdue") {
        return `${values?.count} days overdue`;
      }
      return key;
    },
  },
}));

jest.mock("@monyvi/logic", () => ({
  calculateCalendarDaysUntil: jest.fn(
    (date: Date, referenceDate: Date = new Date()): number =>
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        Date.UTC(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          referenceDate.getDate()
        )) /
      (1000 * 60 * 60 * 24)
  ),
}));

import { getDueText } from "../../utils/dateHelpers";
import { calculateCalendarDaysUntil } from "@monyvi/logic";

const mockCalculateCalendarDaysUntil = jest.mocked(
  calculateCalendarDaysUntil
);

describe("getDueText", (): void => {
  beforeEach((): void => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-15T18:30:00.000Z"));
  });

  afterEach((): void => {
    jest.useRealTimers();
  });

  it("labels a payment due today using calendar days, not the current time", (): void => {
    expect(getDueText(new Date("2026-05-15T02:00:00.000Z"))).toBe("Due today");
  });

  it("labels tomorrow, future, and overdue payments correctly", (): void => {
    expect(getDueText(new Date("2026-05-16T01:00:00.000Z"))).toBe(
      "Due tomorrow"
    );
    expect(getDueText(new Date("2026-05-20T12:00:00.000Z"))).toBe(
      "Due in 5 days"
    );
    expect(getDueText(new Date("2026-05-13T12:00:00.000Z"))).toBe(
      "2 days overdue"
    );
  });

  it("derives the due label from the shared calendar-day calculation", (): void => {
    mockCalculateCalendarDaysUntil.mockReturnValueOnce(-1);

    expect(getDueText(new Date("2026-05-15T02:00:00.000Z"))).toBe(
      "1 days overdue"
    );
    expect(mockCalculateCalendarDaysUntil).toHaveBeenCalledWith(
      new Date("2026-05-15T02:00:00.000Z")
    );
  });
});
