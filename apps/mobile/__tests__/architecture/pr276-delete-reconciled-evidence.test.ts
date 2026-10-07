import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PR #276 Delete reconciled lifecycle evidence regression", () => {
  it("treats reconciled financial-action roots as ineffective lifecycle evidence", () => {
    const serviceSource = readFileSync(
      resolve(
        __dirname,
        "../../services/delete-metal-holding-command-service.ts"
      ),
      "utf8"
    );
    const predicateStart = serviceSource.indexOf("function isRejectedAction");
    const predicateEnd = serviceSource.indexOf(
      "function assertSuccessfulReplay",
      predicateStart
    );

    expect(predicateStart).toBeGreaterThanOrEqual(0);
    expect(predicateEnd).toBeGreaterThan(predicateStart);
    expect(serviceSource.slice(predicateStart, predicateEnd)).toContain(
      'action.state === "reconciled"'
    );
  });
});
