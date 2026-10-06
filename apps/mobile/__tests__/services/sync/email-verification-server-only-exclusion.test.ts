jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      accounts: {},
      email_verification_resend_limits: {},
    },
  },
}));

import {
  EXCLUDED_TABLES,
  SYNCABLE_TABLES,
} from "@/services/sync/config";

describe("email verification resend limiter sync exclusion", () => {
  it("declares the server-only limiter in the mobile excluded tables", () => {
    expect(EXCLUDED_TABLES).toContain("email_verification_resend_limits");
  });

  it("keeps the limiter out of actual generic sync selection while ordinary tables remain syncable", () => {
    expect(SYNCABLE_TABLES).toContain("accounts");
    expect(SYNCABLE_TABLES).not.toContain(
      "email_verification_resend_limits"
    );
  });
});
