import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("issue #284 Metals fixture observation readiness", () => {
  it("counts the profile-scoped e2e_fixture:* observation sources", () => {
    const preflightSource = readFileSync(
      resolve(__dirname, "../../scripts/e2e-preflight.js"),
      "utf8"
    );

    expect(preflightSource).toMatch(
      /where \\"source\\" like 'e2e_fixture:%';/
    );
    expect(preflightSource).not.toMatch(
      /where \\"source\\" = 'e2e_fixture';/
    );
  });
});
