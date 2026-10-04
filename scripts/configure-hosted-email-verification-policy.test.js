const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEmailVerificationPolicyPayload,
  readManagementConfig,
  summarizeHostedEmailVerificationConfig,
} = require("./configure-hosted-email-verification-policy");

test("builds the approved ten-minute six-digit hosted policy", () => {
  assert.deepEqual(buildEmailVerificationPolicyPayload(), {
    mailer_autoconfirm: false,
    mailer_otp_exp: 600,
    mailer_otp_length: 6,
    smtp_max_frequency: 120,
  });
});

test("management policy helper only requires project management credentials", () => {
  assert.deepEqual(
    readManagementConfig({
      SUPABASE_ACCESS_TOKEN: "token",
      SUPABASE_PROJECT_REF: "project-ref",
    }),
    {
      accessToken: "token",
      projectRef: "project-ref",
    }
  );
});

test("summarizes template/policy compliance without returning template content", () => {
  const summary = summarizeHostedEmailVerificationConfig({
    mailer_autoconfirm: false,
    mailer_otp_exp: 600,
    mailer_otp_length: 6,
    smtp_max_frequency: 120,
    mailer_subjects_confirmation:
      "{{ .Token }} is your Monyvi verification code",
    mailer_templates_confirmation_content:
      "<p>Your code is {{ .Token }}. It expires in 10 minutes.</p>",
  });

  assert.deepEqual(summary, {
    confirmationRequired: true,
    otpExpiresInSeconds: 600,
    otpLength: 6,
    minimumEmailSendFrequencySeconds: 120,
    confirmationTemplateUsesToken: true,
    confirmationTemplateMentionsTenMinutes: true,
    confirmationSubjectUsesToken: true,
  });
  assert.equal(JSON.stringify(summary).includes("Your code is"), false);
});
