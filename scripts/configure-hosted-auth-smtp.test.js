const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildHostedAuthSmtpConfig,
  buildHostedAuthSmtpPayload,
  redactHostedAuthSmtpPayload,
} = require("./configure-hosted-auth-smtp");

const COMPLETE_ENV = {
  SUPABASE_ACCESS_TOKEN: "test-management-token",
  SUPABASE_PROJECT_REF: "project-ref",
  MONYVI_AUTH_SMTP_FROM: "verify@auth.monyvi.test",
  MONYVI_AUTH_SMTP_PASSWORD: "test-smtp-password",
};

test("builds the Supabase Auth SMTP payload from environment configuration", () => {
  const config = buildHostedAuthSmtpConfig(COMPLETE_ENV);

  assert.deepEqual(buildHostedAuthSmtpPayload(config), {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    smtp_admin_email: "verify@auth.monyvi.test",
    smtp_host: "smtp.resend.com",
    smtp_port: 465,
    smtp_user: "resend",
    smtp_pass: "test-smtp-password",
    smtp_sender_name: "Monyvi",
  });
});

test("rejects an incomplete configuration with variable names but no values", () => {
  assert.throws(
    () => buildHostedAuthSmtpConfig({}),
    /MONYVI_AUTH_SMTP_FROM, MONYVI_AUTH_SMTP_PASSWORD, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF/
  );
});

test("rejects placeholder sender domains", () => {
  assert.throws(
    () =>
      buildHostedAuthSmtpConfig({
        ...COMPLETE_ENV,
        MONYVI_AUTH_SMTP_FROM: "verify@example.com",
      }),
    /Monyvi-controlled domain/
  );
});

test("redacts the SMTP credential from diagnostic output", () => {
  const payload = buildHostedAuthSmtpPayload(
    buildHostedAuthSmtpConfig(COMPLETE_ENV)
  );

  const redactedPayload = redactHostedAuthSmtpPayload(payload);

  assert.equal(redactedPayload.smtp_pass, "[REDACTED]");
  assert.equal(
    JSON.stringify(redactedPayload).includes("test-smtp-password"),
    false
  );
});
