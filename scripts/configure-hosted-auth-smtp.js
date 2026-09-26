const REQUIRED_VARIABLES = [
  "MONYVI_AUTH_SMTP_FROM",
  "MONYVI_AUTH_SMTP_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
];

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
]);

function buildHostedAuthSmtpConfig(environment) {
  const missingVariables = REQUIRED_VARIABLES.filter(
    (name) => !environment[name]?.trim()
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`
    );
  }

  const senderEmail = environment.MONYVI_AUTH_SMTP_FROM.trim();
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
  if (!senderDomain || PLACEHOLDER_DOMAINS.has(senderDomain)) {
    throw new Error(
      "MONYVI_AUTH_SMTP_FROM must use a verified Monyvi-controlled domain."
    );
  }

  const smtpPort = Number(environment.MONYVI_AUTH_SMTP_PORT ?? "465");
  if (!Number.isInteger(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
    throw new Error("MONYVI_AUTH_SMTP_PORT must be a valid TCP port.");
  }

  return {
    accessToken: environment.SUPABASE_ACCESS_TOKEN.trim(),
    projectRef: environment.SUPABASE_PROJECT_REF.trim(),
    senderEmail,
    smtpHost: environment.MONYVI_AUTH_SMTP_HOST?.trim() || "smtp.resend.com",
    smtpPort,
    smtpUser: environment.MONYVI_AUTH_SMTP_USER?.trim() || "resend",
    smtpPassword: environment.MONYVI_AUTH_SMTP_PASSWORD.trim(),
    senderName: environment.MONYVI_AUTH_SMTP_SENDER_NAME?.trim() || "Monyvi",
  };
}

function buildHostedAuthSmtpPayload(config) {
  return {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    smtp_admin_email: config.senderEmail,
    smtp_host: config.smtpHost,
    smtp_port: config.smtpPort,
    smtp_user: config.smtpUser,
    smtp_pass: config.smtpPassword,
    smtp_sender_name: config.senderName,
  };
}

function redactHostedAuthSmtpPayload(payload) {
  return { ...payload, smtp_pass: "[REDACTED]" };
}

async function applyHostedAuthSmtpConfig(config) {
  const payload = buildHostedAuthSmtpPayload(config);
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(config.projectRef)}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Supabase Auth configuration failed with HTTP ${response.status}.`
    );
  }

  return redactHostedAuthSmtpPayload(payload);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--apply") {
    throw new Error(
      "Use --check to validate or --apply to update hosted Auth."
    );
  }

  const config = buildHostedAuthSmtpConfig(process.env);
  const redactedPayload = redactHostedAuthSmtpPayload(
    buildHostedAuthSmtpPayload(config)
  );

  if (mode === "--check") {
    console.info("Hosted Auth SMTP configuration is ready:", redactedPayload);
    return;
  }

  const appliedPayload = await applyHostedAuthSmtpConfig(config);
  console.info("Hosted Auth SMTP configuration applied:", appliedPayload);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    process.exitCode = 1;
  });
}

module.exports = {
  applyHostedAuthSmtpConfig,
  buildHostedAuthSmtpConfig,
  buildHostedAuthSmtpPayload,
  redactHostedAuthSmtpPayload,
};
