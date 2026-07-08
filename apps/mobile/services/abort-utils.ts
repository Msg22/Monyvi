export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function assertNotAborted(
  abortSignal: AbortSignal | undefined,
  message: string
): void {
  if (abortSignal?.aborted) {
    throw createAbortError(message);
  }
}
