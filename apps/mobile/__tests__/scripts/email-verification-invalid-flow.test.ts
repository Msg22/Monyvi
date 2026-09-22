import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("email verification invalid-link journey", () => {
  it("requires an explicit recovery acknowledgement before returning to sign in", () => {
    const flow = readFileSync(
      join(__dirname, "../../e2e/maestro/auth/email-verification-invalid.yaml"),
      "utf8"
    );

    expect(flow.match(/id: "auth-callback-failure-view"/g)).toHaveLength(2);
    expect(flow.match(/id: "auth-callback-back"/g)).toHaveLength(2);
  });
});
