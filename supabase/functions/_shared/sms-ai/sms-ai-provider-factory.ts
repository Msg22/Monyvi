import type { SmsAiProvider } from "./sms-ai-provider.ts";
import {
  readSmsAiProviderConfig,
  type GetSmsAiEnvironmentValue,
  type SmsAiProviderConfig,
  type SmsAiServiceTier,
} from "./sms-ai-provider-config.ts";
import {
  DeepInfraSmsProvider,
  type DeepInfraSmsProviderDependencies,
} from "./providers/deepinfra-sms-provider.ts";

export interface SmsAiProviderFactoryConfig {
  readonly provider: string;
  readonly model: string;
  readonly serviceTier: SmsAiServiceTier;
  readonly apiKey: string;
}

export function createSmsAiProvider(
  config: SmsAiProviderFactoryConfig,
  dependencies: DeepInfraSmsProviderDependencies = {}
): SmsAiProvider {
  if (config.provider !== "deepinfra") {
    throw new Error(`Unsupported SMS AI provider: ${config.provider}`);
  }

  const deepInfraConfig: SmsAiProviderConfig = {
    provider: "deepinfra",
    model: config.model,
    serviceTier: config.serviceTier,
    apiKey: config.apiKey,
  };
  return new DeepInfraSmsProvider(deepInfraConfig, dependencies);
}

export function createConfiguredSmsAiProvider(
  getEnvironmentValue: GetSmsAiEnvironmentValue,
  dependencies: DeepInfraSmsProviderDependencies = {}
): SmsAiProvider {
  const config = readSmsAiProviderConfig(getEnvironmentValue);
  return createSmsAiProvider(config, dependencies);
}
