export interface CompleteSmsAiWorkInput {
  readonly requestId: string;
  readonly completedWithProviderError: boolean;
  readonly decisionCode: string;
}

export type CompleteSmsAiWork = (
  input: CompleteSmsAiWorkInput
) => Promise<boolean>;

const MAX_COMPLETION_ATTEMPTS = 3;

export async function completeSmsAiWorkWithRetry(
  completeWork: CompleteSmsAiWork,
  input: CompleteSmsAiWorkInput
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_COMPLETION_ATTEMPTS; attempt += 1) {
    try {
      if (await completeWork(input)) return true;
    } catch {
      // A stable request ID makes the completion RPC safe to retry.
    }
  }

  return false;
}
