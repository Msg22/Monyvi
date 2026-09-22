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
  createRootA,
  SNAPSHOT_A_ID,
} from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

class ResubscribeDataSource implements MarketRateSnapshotDataSource {
  private rootsObserver: MarketRateSnapshotRowsObserver<
    readonly MarketRateRootCandidate[]
  > | null = null;
  private observationsObserver: MarketRateSnapshotRowsObserver<
    readonly MarketRateObservationCandidate[]
  > | null = null;

  observeRoots(
    observer: MarketRateSnapshotRowsObserver<readonly MarketRateRootCandidate[]>
  ): MarketRateSnapshotSubscription {
    this.rootsObserver = observer;
    return {
      unsubscribe: (): void => {
        if (this.rootsObserver === observer) {
          this.rootsObserver = null;
        }
      },
    };
  }

  observeObservations(
    _batchIds: readonly string[],
    observer: MarketRateSnapshotRowsObserver<
      readonly MarketRateObservationCandidate[]
    >
  ): MarketRateSnapshotSubscription {
    this.observationsObserver = observer;
    return {
      unsubscribe: (): void => {
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

  emitRoots(rows: readonly MarketRateRootCandidate[]): void {
    this.rootsObserver?.next(rows);
  }

  emitObservations(rows: readonly MarketRateObservationCandidate[]): void {
    this.observationsObserver?.next(rows);
  }
}

describe("atomic market-rate stream resubscribe", () => {
  it("revalidates persisted rows instead of replaying a stale in-memory selection", () => {
    const source = new ResubscribeDataSource();
    const stream = createMarketRateSnapshotStream(source, () => NOW_MS);
    const first = jest.fn<void, [unknown]>();
    const firstSubscription = stream.subscribe({ next: first });

    source.emitRoots([createRootA()]);
    source.emitObservations(createObservationsA());
    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotId: SNAPSHOT_A_ID })
    );
    firstSubscription.unsubscribe();

    const second = jest.fn<void, [unknown]>();
    const secondSubscription = stream.subscribe({ next: second });

    expect(second).not.toHaveBeenCalled();
    source.emitRoots([createRootA()]);
    expect(second).not.toHaveBeenCalled();
    source.emitObservations([]);
    expect(second).toHaveBeenLastCalledWith(null);

    secondSubscription.unsubscribe();
  });
});
