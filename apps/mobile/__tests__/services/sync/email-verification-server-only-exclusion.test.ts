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
} from "../../../../services/sync/config";

describe("email verification resend limiter sync exclusion", () => {
  it("keeps the server-only limiter out of generic mobile sync", () => {
    expect(EXCLUDED_TABLES).toContain("email_verification_resend_limits");
    expect(SYNCABLE_TABLES).not.toContain(
      "email_verification_resend_limits"
    );
  });
});
