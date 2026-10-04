import fs from "node:fs";
import path from "node:path";

function readSupabaseConfig(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../../supabase/config.toml"),
    "utf8"
  );
}

describe("email verification local Auth configuration", () => {
  it("requires confirmation, six-digit codes, ten-minute expiry, and two-minute resend frequency", () => {
    const config = readSupabaseConfig();
    const emailSection =
      config.match(/\[auth\.email\][\s\S]*?(?=\n\[[^\n]+\]|$)/)?.[0] ??
      "";

    expect(emailSection).toContain("enable_confirmations = true");
    expect(emailSection).toContain('max_frequency = "2m"');
    expect(emailSection).toContain("otp_length = 6");
    expect(emailSection).toContain("otp_expiry = 600");
  });

  it("uses the local code-first confirmation template", () => {
    const config = readSupabaseConfig();

    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain(
      'content_path = "./supabase/templates/confirmation.html"'
    );
  });
});
