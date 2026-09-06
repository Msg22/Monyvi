import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PR #276 Delete destructive contrast regression", () => {
  it("keeps the dark confirm button on the accessible red-600 token", () => {
    const sheetSource = readFileSync(
      resolve(__dirname, "../../components/metals/DeleteMetalHoldingSheet.tsx"),
      "utf8"
    );
    const actionsStart = sheetSource.indexOf("function DeleteActions");
    const actionsEnd = sheetSource.indexOf(
      "function requestAccessibilityFocus",
      actionsStart
    );

    expect(actionsStart).toBeGreaterThanOrEqual(0);
    expect(actionsEnd).toBeGreaterThan(actionsStart);
    const actionsSource = sheetSource.slice(actionsStart, actionsEnd);
    expect(actionsSource).toContain("dark:bg-red-600");
    expect(actionsSource).not.toContain("dark:bg-red-500");
  });
});
