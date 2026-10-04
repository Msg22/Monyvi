/**
 * Concurrent Batch Queue Service
 *
 * Shared bounded, refilling worker pool used by both the production SMS AI
 * parser and the development synthetic SMS evaluation. Guarantees:
 * - at most `maxConcurrent` items in flight at any time;
 * - the next queued item launches as soon as a worker frees (not waves waiting
 *   for the slowest item);
 * - dynamic enqueue from inside a running item (e.g. 413/rolling splits);
 * - `stop()` prevents new launches while already-active items drain;
 * - signal abort stops launches and classifies in-flight rejections as
 *   cancelled, leaving never-started items `notRun`;
 * - per-item rejections are collected (never silently dropped) and the whole
 *   run still drains.
 */

export interface ConcurrentBatchRun<TItem> {
  /** Append a new item to the work list; a free worker may claim it. */
  readonly enqueue: (item: TItem) => void;
  /** Stop launching queued items; already-active items still drain. */
  readonly stop: () => void;
  readonly signal: AbortSignal;
  readonly maxConcurrent: number;
}

export interface ConcurrentBatchQueueOptions<TItem> {
  readonly items: readonly TItem[];
  readonly maxConcurrent: number;
  readonly signal: AbortSignal;
  readonly process: (
    item: TItem,
    run: ConcurrentBatchRun<TItem>
  ) => Promise<void>;
}

export interface ConcurrentBatchItemError<TItem> {
  readonly item: TItem;
  readonly error: unknown;
}

export interface ConcurrentBatchQueueResult<TItem> {
  readonly completed: readonly TItem[];
  readonly failed: ReadonlyArray<ConcurrentBatchItemError<TItem>>;
  readonly cancelled: readonly TItem[];
  readonly notRun: readonly TItem[];
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function runConcurrentBatchQueue<TItem>(
  options: ConcurrentBatchQueueOptions<TItem>
): Promise<ConcurrentBatchQueueResult<TItem>> {
  const workList: TItem[] = [...options.items];
  const completed: TItem[] = [];
  const failed: Array<ConcurrentBatchItemError<TItem>> = [];
  const cancelled: TItem[] = [];
  let stopped = false;
  let cursor = 0;
  let activeWorkers = 0;
  let settled = false;

  const maxConcurrent = Math.max(1, options.maxConcurrent);

  return new Promise<ConcurrentBatchQueueResult<TItem>>((resolve) => {
    const onAbort = (): void => {
      pump();
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", onAbort);
      const notRun = workList.slice(cursor);
      resolve({ completed, failed, cancelled, notRun });
    };

    if (options.signal.aborted) {
      finish();
      return;
    }

    options.signal.addEventListener("abort", onAbort, { once: true });

    const claimNext = (): TItem | undefined => {
      if (stopped || options.signal.aborted) return undefined;
      if (cursor < workList.length) {
        const item = workList[cursor];
        cursor += 1;
        return item;
      }
      return undefined;
    };

    const run: ConcurrentBatchRun<TItem> = {
      enqueue: (item: TItem): void => {
        workList.push(item);
        pump();
      },
      stop: (): void => {
        stopped = true;
        pump();
      },
      signal: options.signal,
      maxConcurrent: options.maxConcurrent,
    };

    const runWorker = async (firstItem: TItem): Promise<void> => {
      let currentItem: TItem | undefined = firstItem;
      try {
        while (currentItem !== undefined) {
          try {
            await options.process(currentItem, run);
            completed.push(currentItem);
          } catch (error: unknown) {
            if (isAbortError(error) && options.signal.aborted) {
              cancelled.push(currentItem);
            } else {
              failed.push({ item: currentItem, error });
            }
          }
          currentItem = claimNext();
        }
      } finally {
        activeWorkers -= 1;
        pump();
      }
    };

    const pump = (): void => {
      if (settled) return;
      if (stopped || options.signal.aborted) {
        if (activeWorkers === 0) {
          finish();
        }
        return;
      }
      while (activeWorkers < maxConcurrent) {
        const nextItem = claimNext();
        if (nextItem === undefined) {
          break;
        }
        activeWorkers += 1;
        void runWorker(nextItem);
      }
      if (activeWorkers === 0 && cursor >= workList.length) {
        finish();
      }
    };

    pump();
  });
}
