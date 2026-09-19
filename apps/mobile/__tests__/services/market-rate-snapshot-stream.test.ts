import {
  createMarketRateSnapshotStream,
  type MarketRateObservationCandidate,
  type MarketRateRootCandidate,
  type MarketRateSnapshotDataSource,
  type MarketRateSnapshotRowsObserver,
  type MarketRateSnapshotSubscription,
} from "@/services/market-rate-snapshot-read-model-service";
import {
  createObservationsA,
  createObservationsB,
  createRootA,
  createRootB,
  SNAPSHOT_A_ID,
  SNAPSHOT_B_ID,
} from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

class FakeSnapshotDataSource implements MarketRateSnapshotDataSource {
  private rootsObserver: MarketRateSnapshotRowsObserver<
    readonly MarketRateRootCandidate[]
  > | null = null;
  private observationsObserver: MarketRateSnapshotRowsObserver<
    readonly MarketRateObservationCandidate[]
  > | null = null;

  readonly observedBatchIds: string[][] = [];
  observeRootsCalls = 0;
  observeObservationsCalls = 0;
  rootsUnsubscribeCalls = 0;
  observationsUnsubscribeCalls = 0;
  failRootsSynchronously = false;
  readonly rootObservers: Array<
    MarketRateSnapshotRowsObserver<readonly MarketRateRootCandidate[]>
  > = [];

  observeRoots(
    observer: MarketRateSnapshotRowsObserver<readonly MarketRateRootCandidate[]>
  ): MarketRateSnapshotSubscription {
    this.observeRootsCalls += 1;
    this.rootsObserver = observer;
    this.rootObservers.push(observer);
    if (this.failRootsSynchronously)
      observer.error?.(new Error("synchronous failure"));
    return {
      unsubscribe: (): void => {
        this.rootsUnsubscribeCalls += 1;
        if (this.rootsObserver === observer) {
          this.rootsObserver = null;
        }
      },
    };
  }

  observeObservations(
    batchIds: readonly string[],
    observer: MarketRateSnapshotRowsObserver<
      readonly MarketRateObservationCandidate[]
    >
  ): MarketRateSnapshotSubscription {
    this.observeObservationsCalls += 1;
    this.observedBatchIds.push([...batchIds]);
    this.observationsObserver = observer;
    return {
      unsubscribe: (): void => {
        this.observationsUnsubscribeCalls += 1;
        if (this.observationsObserver === observer) {
          this.observationsObserver = null;
        }
      },
    };
  }

  fetchRoots(): Promise<readonly MarketRateRootCandidate[]> {
    return Promise.resolve([]);
  }

  fetchObservations(
    _batchIds: readonly string[]
  ): Promise<readonly MarketRateObservationCandidate[]> {
    return Promise.resolve([]);
  }

  emitRoots(roots: readonly MarketRateRootCandidate[]): void {
    this.rootsObserver?.next(roots);
  }

  emitObservations(
    observations: readonly MarketRateObservationCandidate[]
  ): void {
    this.observationsObserver?.next(observations);
  }

  failObservations(error: unknown): void {
    this.observationsObserver?.error?.(error);
  }

  failRoots(error: unknown): void {
    this.rootsObserver?.error?.(error);
  }
}

describe("atomic market-rate snapshot stream", () => {
  it("cleans up a synchronous subscription failure and ignores obsolete callbacks after retry", () => {
    const source = new FakeSnapshotDataSource();
    source.failRootsSynchronously = true;
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const next = jest.fn<void, [unknown]>();
    const error = jest.fn<void, [unknown]>();
    const subscription = stream.subscribe({ next, error });
    expect(source.rootsUnsubscribeCalls).toBe(1);
    source.failRootsSynchronously = false;
    stream.refresh();
    source.emitRoots([createRootB()]);
    source.emitObservations(createObservationsB());
    next.mockClear();
    error.mockClear();
    source.rootObservers[0]?.next([createRootA()]);
    source.rootObservers[0]?.error?.(new Error("late old failure"));
    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    subscription.unsubscribe();
    expect(source.rootsUnsubscribeCalls).toBe(2);
  });
  it.each(["roots", "observations"] as const)(
    "restarts %s observation on retry while keeping the last snapshot",
    (kind) => {
      const source = new FakeSnapshotDataSource();
      const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
      const next = jest.fn<void, [unknown]>();
      const subscription = stream.subscribe({ next, error: jest.fn() });
      source.emitRoots([createRootA()]);
      source.emitObservations(createObservationsA());
      if (kind === "roots") source.failRoots(new Error("read failed"));
      else source.failObservations(new Error("read failed"));
      next.mockClear();
      stream.refresh();
      expect(source.observeRootsCalls).toBe(2);
      expect(next).toHaveBeenLastCalledWith(
        expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
      );
      source.emitRoots([createRootB()]);
      source.emitObservations(createObservationsB());
      expect(next).toHaveBeenLastCalledWith(
        expect.objectContaining({ snapshotId: SNAPSHOT_B_ID })
      );
      subscription.unsubscribe();
    }
  );

  it("a later subscriber restarts a failed root subscription before any snapshot existed", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const first = stream.subscribe({ next: jest.fn(), error: jest.fn() });
    source.failRoots(new Error("initial read failed"));
    const next = jest.fn<void, [unknown]>();
    const second = stream.subscribe({ next });
    expect(source.observeRootsCalls).toBe(2);
    source.emitRoots([createRootB()]);
    source.emitObservations(createObservationsB());
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_B_ID })
    );
    first.unsubscribe();
    second.unsubscribe();
  });
  it("does not emit an incomplete zero/null result between root and children", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const next = jest.fn<void, [unknown]>();
    const subscription = stream.subscribe({ next });

    source.emitRoots([createRootA()]);
    expect(next).not.toHaveBeenCalled();

    source.emitObservations(createObservationsA());
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );

    subscription.unsubscribe();
  });

  it("keeps complete A while newer B is incomplete, then promotes complete B", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const emitted: Array<string | null> = [];
    const subscription = stream.subscribe({
      next: (snapshot): void => {
        emitted.push(snapshot?.snapshotId ?? null);
      },
    });

    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());

    source.emitRoots([createRootA(), createRootB()]);
    source.emitObservations([
      ...createObservationsA(),
      ...createObservationsB().filter(
        ({ instrumentCode }) => instrumentCode !== "currency:EGP"
      ),
    ]);
    expect(emitted.at(-1)).toBe(SNAPSHOT_A_ID);

    source.emitObservations([
      ...createObservationsA(),
      ...createObservationsB(),
    ]);
    expect(emitted.at(-1)).toBe(SNAPSHOT_B_ID);

    subscription.unsubscribe();
  });

  it("reacts to removed evidence and never repairs a batch from foreign rows", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const emitted: Array<string | null> = [];
    const subscription = stream.subscribe({
      next: (snapshot): void => {
        emitted.push(snapshot?.snapshotId ?? null);
      },
    });

    source.emitRoots([createRootA(), createRootB()]);
    source.emitObservations([
      ...createObservationsA(),
      ...createObservationsB(),
    ]);
    expect(emitted.at(-1)).toBe(SNAPSHOT_B_ID);

    const withoutBUsd = createObservationsB().filter(
      ({ instrumentCode }) => instrumentCode !== "currency:USD"
    );
    const foreignUsd = createObservationsA()
      .filter(({ instrumentCode }) => instrumentCode === "currency:USD")
      .map((observation) => ({
        ...observation,
        id: "f0f0f0f0-0000-4000-8000-000000000001",
        batchId: "f0f0f0f0-0000-4000-8000-000000000002",
      }));

    source.emitObservations([
      ...createObservationsA(),
      ...withoutBUsd,
      ...foreignUsd,
    ]);
    expect(emitted.at(-1)).toBe(SNAPSHOT_A_ID);

    source.emitObservations([...withoutBUsd, ...foreignUsd]);
    expect(emitted.at(-1)).toBeNull();

    subscription.unsubscribe();
  });

  it("multicasts one root/child observation lifecycle to every consumer", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const first = jest.fn<void, [unknown]>();
    const second = jest.fn<void, [unknown]>();

    const firstSubscription = stream.subscribe({ next: first });
    const secondSubscription = stream.subscribe({ next: second });

    expect(source.observeRootsCalls).toBe(1);
    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());

    expect(source.observeObservationsCalls).toBe(1);
    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );
    expect(second).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );

    firstSubscription.unsubscribe();
    expect(source.rootsUnsubscribeCalls).toBe(0);
    secondSubscription.unsubscribe();
    expect(source.rootsUnsubscribeCalls).toBe(1);
    expect(source.observationsUnsubscribeCalls).toBe(1);
  });

  it("retains the last complete value when a live observation query fails", () => {
    const source = new FakeSnapshotDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const next = jest.fn<void, [unknown]>();
    const error = jest.fn<void, [unknown]>();
    const subscription = stream.subscribe({ next, error });

    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());
    source.failObservations(new Error("temporary observation failure"));

    expect(error).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );

    next.mockClear();
    stream.refresh();
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );

    subscription.unsubscribe();
  });

  it("reconstructs the same complete snapshot after a process-style restart", () => {
    const source = new FakeSnapshotDataSource();
    const beforeRestart = createMarketRateSnapshotStream(source, () => NOW_MS);
    const first = jest.fn<void, [unknown]>();
    const firstSubscription = beforeRestart.subscribe({ next: first });

    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());
    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );
    firstSubscription.unsubscribe();

    const afterRestart = createMarketRateSnapshotStream(source, () => NOW_MS);
    const second = jest.fn<void, [unknown]>();
    const secondSubscription = afterRestart.subscribe({ next: second });

    expect(second).not.toHaveBeenCalled();
    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());
    expect(second).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );

    secondSubscription.unsubscribe();
  });
});
