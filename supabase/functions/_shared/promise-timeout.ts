export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: (reason: unknown) => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  const abortFromExternalSignal = (): void => {
    const reason =
      externalSignal?.reason ??
      Object.assign(new Error("Operation aborted"), {
        name: "AbortError",
      });
    controller.abort(reason);
    rejectCancellation(reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
  }

  timeoutId = setTimeout(() => {
    const timeoutError = new Error("Operation timed out");
    timeoutError.name = "TimeoutError";
    controller.abort(timeoutError);
    rejectCancellation(timeoutError);
  }, timeoutMs);

  try {
    return await Promise.race([operation(controller.signal), cancellation]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}
