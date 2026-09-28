export type SmsAiProviderName = "deepinfra";
export type SmsAiServiceTier = "default" | "priority";

export interface SmsAiProviderConfig {
  readonly provider: SmsAiProviderName;
  readonly model: string;
  readonly serviceTier: SmsAiServiceTier;
  readonly apiKey: string;
}

export type GetSmsAiEnvironmentValue = (name: string) => string | undefined;

function readRequiredValue(
  getEnvironmentValue: GetSmsAiEnvironmentValue,
  name: string
): string {
  const value = getEnvironmentValue(name)?.trim();
  if (!value) {
    throw new Error(
      `SMS AI provider configuration missing required value: ${name}`
    );
  }
  return value;
}

export function readSmsAiProviderConfig(
  getEnvironmentValue: GetSmsAiEnvironmentValue
): SmsAiProviderConfig {
  const provider = readRequiredValue(getEnvironmentValue, "SMS_AI_PROVIDER");
  const model = readRequiredValue(getEnvironmentValue, "SMS_AI_MODEL");
  const approvedModelsValue = readRequiredValue(
    getEnvironmentValue,
    "SMS_AI_APPROVED_MODELS"
  );
  const serviceTier = readRequiredValue(
    getEnvironmentValue,
    "SMS_AI_SERVICE_TIER"
  );
  const apiKey = readRequiredValue(getEnvironmentValue, "DEEPINFRA_API_KEY");

  if (provider !== "deepinfra") {
    throw new Error(`Unsupported SMS AI provider: ${provider}`);
  }
  if (!parseApprovedModelList(approvedModelsValue).has(model)) {
    throw new Error(`Unsupported SMS AI model: ${model}`);
  }
  if (serviceTier !== "default" && serviceTier !== "priority") {
    throw new Error(`Unsupported SMS AI service tier: ${serviceTier}`);
  }

  return {
    provider,
    model,
    serviceTier,
    apiKey,
  };
}

function parseApprovedModelList(value: string): ReadonlySet<string> {
  const entries = value.split(",").map((entry) => entry.trim());
  for (const entry of entries) {
    if (!isValidApprovedModelId(entry)) {
      throw new Error(
        `SMS AI provider configuration has malformed value: SMS_AI_APPROVED_MODELS`
      );
    }
  }
  return new Set(entries);
}

function isValidApprovedModelId(entry: string): boolean {
  if (!entry || entry.includes("*") || /\s/.test(entry)) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(entry);
}
