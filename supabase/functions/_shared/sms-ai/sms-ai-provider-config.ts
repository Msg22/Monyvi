export type SmsAiProviderName = "deepinfra";
export type SmsAiServiceTier = "default" | "priority" | "flex";

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
  const serviceTier = readRequiredValue(
    getEnvironmentValue,
    "SMS_AI_SERVICE_TIER"
  );
  const apiKey = readRequiredValue(getEnvironmentValue, "DEEPINFRA_API_KEY");

  if (provider !== "deepinfra") {
    throw new Error(`Unsupported SMS AI provider: ${provider}`);
  }
  if (
    serviceTier !== "default" &&
    serviceTier !== "priority" &&
    serviceTier !== "flex"
  ) {
    throw new Error(`Unsupported SMS AI service tier: ${serviceTier}`);
  }

  return {
    provider,
    model,
    serviceTier,
    apiKey,
  };
}
