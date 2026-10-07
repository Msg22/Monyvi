import { CONCURRENT_BATCHES } from "@/constants/sms-ai";
import { MOBILE_SMS_PROVIDER_EVALUATION_MAX_CONCURRENT_BATCHES } from "@/constants/sms-provider-evaluation";
import {
  runConcurrentBatchQueue,
  type ConcurrentBatchRun,
} from "@/services/concurrent-batch-queue-service";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function createItems(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `item-${index}`);
}

describe("concurrent-batch-queue-service", () => {
  it("caps concurrent execution at the shared limit and refills as each item completes", async () => {
    const items = createItems(25);
    const active = new Set<string>();
    let maxActive = 0;
    const deferreds: Array<Deferred<void>> = [];
    const process = jest.fn((value: string): Promise<void> => {
      active.add(value);
      maxActive = Math.max(maxActive, active.size);
      const deferred = createDeferred<void>();
      deferreds.push(deferred);
      return deferred.promise.then(() => {
        active.delete(value);
      });
    });

    const resultPromise = runConcurrentBatchQueue({
      items,
      maxConcurrent: CONCURRENT_BATCHES,
      signal: new AbortController().signal,
      process,
    });
    await flushAsync();

    expect(active.size).toBe(CONCURRENT_BATCHES);
    expect(process).toHaveBeenCalledTimes(CONCURRENT_BATCHES);
    expect(maxActive).toBe(CONCURRENT_BATCHES);

    deferreds[0]?.resolve();
    await flushAsync();
    expect(process).toHaveBeenCalledTimes(CONCURRENT_BATCHES + 1);
    expect(active.size).toBe(CONCURRENT_BATCHES);

    let resolveRounds = 0;
    while (process.mock.calls.length < items.length && resolveRounds < 50) {
      for (const deferred of deferreds) deferred.resolve();
      await flushAsync();
      resolveRounds += 1;
    }
    // Drain any deferreds created by the final launches before awaiting.
    for (const deferred of deferreds) deferred.resolve();
    await flushAsync();
    const result = await resultPromise;

    expect(result.completed).toHaveLength(items.length);
    expect(new Set(result.completed).size).toBe(items.length);
    expect(result.failed).toHaveLength(0);
    expect(result.cancelled).toHaveLength(0);
    expect(maxActive).toBe(CONCURRENT_BATCHES);
  });

  it("preserves out-of-order completions and processes each item exactly once", async () => {
    const deferreds: Array<Deferred<void>> = [];
    const started: string[] = [];
    const process = jest.fn((value: string): Promise<void> => {
      started.push(value);
      const deferred = createDeferred<void>();
      deferreds.push(deferred);
      return deferred.promise;
    });

    const resultPromise = runConcurrentBatchQueue({
      items: createItems(3),
      maxConcurrent: 3,
      signal: new AbortController().signal,
      process,
    });
    await flushAsync();
    expect(started).toEqual(["item-0", "item-1", "item-2"]);

    deferreds[2]?.resolve();
    await flushAsync();
    deferreds[0]?.resolve();
    await flushAsync();
    deferreds[1]?.resolve();

    const result = await resultPromise;
    expect(result.completed).toEqual(
      expect.arrayContaining(["item-0", "item-1", "item-2"])
    );
    expect(result.completed).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(started.filter((value) => value === "item-1")).toHaveLength(1);
  });

  it("supports dynamic enqueue from within a running item", async () => {
    const enqueued: string[] = [];
    const process = jest.fn(
      (value: string, run: ConcurrentBatchRun<string>): Promise<void> => {
        if (value === "item-0") {
          run.enqueue("child-a");
          run.enqueue("child-b");
        }
        enqueued.push(value);
        return Promise.resolve();
      }
    );

    const result = await runConcurrentBatchQueue({
      items: ["item-0"],
      maxConcurrent: 2,
      signal: new AbortController().signal,
      process,
    });

    expect(enqueued).toEqual(
      expect.arrayContaining(["item-0", "child-a", "child-b"])
    );
    expect(result.completed).toEqual(
      expect.arrayContaining(["item-0", "child-a", "child-b"])
    );
    expect(result.completed).toHaveLength(3);
    expect(result.notRun).toHaveLength(0);
  });

  it("dynamically wakes workers up to maxConcurrent when items are enqueued and refills spare slots", async () => {
    const active = new Set<string>();
    let maxActive = 0;
    const deferreds = new Map<string, Deferred<void>>();

    const getDeferred = (id: string): Deferred<void> => {
      const existing = deferreds.get(id);
      if (existing !== undefined) return existing;
      const created = createDeferred<void>();
      deferreds.set(id, created);
      return created;
    };

    const process = jest.fn(
      async (item: string, run: ConcurrentBatchRun<string>): Promise<void> => {
        active.add(item);
        maxActive = Math.max(maxActive, active.size);

        if (item === "parent") {
          for (let index = 0; index < 15; index += 1) {
            run.enqueue(`child-${index}`);
          }
        }

        const deferred = getDeferred(item);
        await deferred.promise;
        active.delete(item);
      }
    );

    const resultPromise = runConcurrentBatchQueue({
      items: ["parent"],
      maxConcurrent: CONCURRENT_BATCHES,
      signal: new AbortController().signal,
      process,
    });

    await flushAsync();

    expect(active.size).toBe(CONCURRENT_BATCHES);
    expect(maxActive).toBe(CONCURRENT_BATCHES);
    expect(active.has("parent")).toBe(true);

    getDeferred("parent").resolve();
    await flushAsync();

    expect(active.size).toBe(CONCURRENT_BATCHES);

    for (let index = 0; index < 15; index += 1) {
      getDeferred(`child-${index}`).resolve();
      await flushAsync();
    }

    const result = await resultPromise;
    expect(result.completed).toHaveLength(16);
    expect(result.failed).toHaveLength(0);
    expect(result.cancelled).toHaveLength(0);
    expect(result.notRun).toHaveLength(0);
    expect(maxActive).toBe(CONCURRENT_BATCHES);
  });

  it("retains dynamically enqueued children in notRun when stop() is invoked", async () => {
    const active = new Set<string>();
    const deferreds = new Map<string, Deferred<void>>();

    const getDeferred = (id: string): Deferred<void> => {
      const existing = deferreds.get(id);
      if (existing !== undefined) return existing;
      const created = createDeferred<void>();
      deferreds.set(id, created);
      return created;
    };

    const process = jest.fn(
      async (item: string, run: ConcurrentBatchRun<string>): Promise<void> => {
        active.add(item);
        if (item === "parent") {
          run.enqueue("child-0");
          run.enqueue("child-1");
          run.enqueue("child-2");
          run.stop();
          run.enqueue("child-after-stop");
        }
        const deferred = getDeferred(item);
        await deferred.promise;
        active.delete(item);
      }
    );

    const resultPromise = runConcurrentBatchQueue({
      items: ["parent"],
      maxConcurrent: 2,
      signal: new AbortController().signal,
      process,
    });

    await flushAsync();

    getDeferred("parent").resolve();
    getDeferred("child-0").resolve();
    await flushAsync();

    const result = await resultPromise;
    expect(result.completed).toEqual(
      expect.arrayContaining(["parent", "child-0"])
    );
    expect(result.completed).toHaveLength(2);
    expect(result.notRun).toEqual(["child-1", "child-2", "child-after-stop"]);
  });

  it("retains dynamically enqueued children in notRun when aborted", async () => {
    const controller = new AbortController();
    const deferreds = new Map<string, Deferred<void>>();

    const getDeferred = (id: string): Deferred<void> => {
      const existing = deferreds.get(id);
      if (existing !== undefined) return existing;
      const created = createDeferred<void>();
      deferreds.set(id, created);
      return created;
    };

    const process = jest.fn(
      async (item: string, run: ConcurrentBatchRun<string>): Promise<void> => {
        if (item === "parent") {
          run.enqueue("child-0");
          run.enqueue("child-1");
        }
        const deferred = getDeferred(item);
        await deferred.promise;
      }
    );

    const resultPromise = runConcurrentBatchQueue({
      items: ["parent"],
      maxConcurrent: 2,
      signal: controller.signal,
      process,
    });

    await flushAsync();
    controller.abort();
    getDeferred("parent").reject(abortError());
    getDeferred("child-0").reject(abortError());

    const result = await resultPromise;
    expect(result.cancelled).toEqual(
      expect.arrayContaining(["parent", "child-0"])
    );
    expect(result.notRun).toEqual(["child-1"]);
  });

  it("stop() prevents new launches and drains already-active items", async () => {
    const deferreds: Array<Deferred<void>> = [];
    const started: string[] = [];
    const process = jest.fn(
      (value: string, run: ConcurrentBatchRun<string>): Promise<void> => {
        started.push(value);
        if (value === "item-1") run.stop();
        const deferred = createDeferred<void>();
        deferreds.push(deferred);
        return deferred.promise;
      }
    );

    const resultPromise = runConcurrentBatchQueue({
      items: createItems(4),
      maxConcurrent: 2,
      signal: new AbortController().signal,
      process,
    });
    await flushAsync();
    expect(started).toEqual(["item-0", "item-1"]);

    for (const deferred of deferreds) deferred.resolve();
    const result = await resultPromise;

    expect(started).toEqual(["item-0", "item-1"]);
    expect(result.completed).toEqual(
      expect.arrayContaining(["item-0", "item-1"])
    );
    expect(result.completed).toHaveLength(2);
    expect(result.notRun).toEqual(["item-2", "item-3"]);
  });

  it("cancels active items and never launches queued items on signal abort", async () => {
    const controller = new AbortController();
    const deferreds: Array<Deferred<void>> = [];
    const started: string[] = [];
    const process = jest.fn((value: string): Promise<void> => {
      started.push(value);
      const deferred = createDeferred<void>();
      deferreds.push(deferred);
      return deferred.promise;
    });

    const resultPromise = runConcurrentBatchQueue({
      items: createItems(5),
      maxConcurrent: 2,
      signal: controller.signal,
      process,
    });
    await flushAsync();
    expect(started).toEqual(["item-0", "item-1"]);

    controller.abort();
    for (const deferred of deferreds) deferred.reject(abortError());

    const result = await resultPromise;
    expect(started).toEqual(["item-0", "item-1"]);
    expect(result.cancelled).toEqual(["item-0", "item-1"]);
    expect(result.notRun).toEqual(["item-2", "item-3", "item-4"]);
    expect(result.failed).toHaveLength(0);
  });

  it("reports a rejected item and still drains the remaining items", async () => {
    const process = jest.fn((value: string): Promise<void> => {
      if (value === "item-0") return Promise.reject(new Error("boom"));
      return Promise.resolve();
    });

    const result = await runConcurrentBatchQueue({
      items: createItems(3),
      maxConcurrent: 3,
      signal: new AbortController().signal,
      process,
    });

    expect(result.completed).toEqual(
      expect.arrayContaining(["item-1", "item-2"])
    );
    expect(result.completed).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.item).toBe("item-0");
    expect(result.failed[0]?.error).toBeInstanceOf(Error);
    expect((result.failed[0]?.error as Error).message).toBe("boom");
    expect(result.cancelled).toHaveLength(0);
    expect(result.notRun).toHaveLength(0);
  });

  it("exposes the shared production concurrency cap and keeps the synthetic alias aligned", () => {
    expect(CONCURRENT_BATCHES).toBe(10);
    expect(MOBILE_SMS_PROVIDER_EVALUATION_MAX_CONCURRENT_BATCHES).toBe(
      CONCURRENT_BATCHES
    );
  });
});
