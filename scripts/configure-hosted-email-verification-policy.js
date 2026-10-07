const REQUIRED_VARIABLES = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"];

function readManagementConfig(environment) {
  const missing = REQUIRED_VARIABLES.filter(
    (name) => !environment[name]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return {
    accessToken: environment.SUPABASE_ACCESS_TOKEN.trim(),
    projectRef: environment.SUPABASE_PROJECT_REF.trim(),
  };
}

function buildEmailVerificationPolicyPayload() {
  return {
    mailer_autoconfirm: false,
    mailer_otp_exp: 600,
    mailer_otp_length: 6,
    smtp_max_frequency: 120,
  };
}

function summarizeHostedEmailVerificationConfig(config) {
  const confirmationTemplate =
    typeof config.mailer_templates_confirmation_content === "string"
      ? config.mailer_templates_confirmation_content
      : "";
  const confirmationSubject =
    typeof config.mailer_subjects_confirmation === "string"
      ? config.mailer_subjects_confirmation
      : "";

  return {
    confirmationRequired: config.mailer_autoconfirm === false,
    otpExpiresInSeconds: config.mailer_otp_exp ?? null,
    otpLength: config.mailer_otp_length ?? null,
    minimumEmailSendFrequencySeconds: config.smtp_max_frequency ?? null,
    confirmationTemplateUsesToken:
      confirmationTemplate.includes("{{ .Token }}") ||
      confirmationTemplate.includes("{{.Token}}"),
    confirmationTemplateMentionsTenMinutes: /10\s*(minutes?|mins?)/i.test(
      confirmationTemplate
    ),
    confirmationSubjectUsesToken:
      confirmationSubject.includes("{{ .Token }}") ||
      confirmationSubject.includes("{{.Token}}"),
  };
}

async function requestHostedAuthConfig(management, options = {}) {
  const response = await (options.fetchImpl ?? fetch)(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(
      management.projectRef
    )}/config/auth`,
    {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${management.accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Supabase Auth configuration request failed with HTTP ${response.status}.`
    );
  }

  return response.json();
}

async function readHostedEmailVerificationStatus(management, fetchImpl) {
  const config = await requestHostedAuthConfig(management, { fetchImpl });
  return summarizeHostedEmailVerificationConfig(config);
}

async function applyHostedEmailVerificationPolicy(management, fetchImpl) {
  await requestHostedAuthConfig(management, {
    fetchImpl,
    method: "PATCH",
    body: buildEmailVerificationPolicyPayload(),
  });

  return readHostedEmailVerificationStatus(management, fetchImpl);
}

async function main() {
  const mode = process.argv[2];
  if (!["--check", "--status", "--apply"].includes(mode)) {
    throw new Error(
      "Use --check, --status, or --apply for hosted email verification policy."
    );
  }

  const management = readManagementConfig(process.env);

  if (mode === "--check") {
    console.info(
      "Hosted email verification policy is ready:",
      buildEmailVerificationPolicyPayload()
    );
    return;
  }

  const summary =
    mode === "--apply"
      ? await applyHostedEmailVerificationPolicy(management)
      : await readHostedEmailVerificationStatus(management);

  console.info("Hosted email verification status:", summary);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  });
}

module.exports = {
  applyHostedEmailVerificationPolicy,
  buildEmailVerificationPolicyPayload,
  readHostedEmailVerificationStatus,
  readManagementConfig,
  summarizeHostedEmailVerificationConfig,
};
