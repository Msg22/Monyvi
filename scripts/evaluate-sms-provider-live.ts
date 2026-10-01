import type {
  EvaluationReport,
  EvaluationRunnerDependencies,
  ParsedCliOptions,
} from "./sms-provider-evaluation/types.ts";

export interface SmsProviderEvaluationCliDependencies
  extends EvaluationRunnerDependencies {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

export function parseSmsProviderEvaluationCliArgs(
  _args: readonly string[],
  _environment: Readonly<Record<string, string | undefined>>
): ParsedCliOptions {
  throw new Error("sms_provider_evaluation_cli_not_implemented");
}

export async function runSmsProviderEvaluationCli(
  _args: readonly string[],
  _dependencies: SmsProviderEvaluationCliDependencies
): Promise<EvaluationReport> {
  throw new Error("sms_provider_evaluation_cli_not_implemented");
}
