import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  readMarketRatePublicationCheckpoint,
  saveMarketRatePublicationCheckpoint,
} from "@/services/market-rate-publication-checkpoint-service";

jest.mock("@react-native-async-storage/async-storage");

const storage = new Map<string, string>();
const EARLIER = {
  createdAt: "2030-01-02T03:04:05.000Z",
  id: "018f0c7a-1234-7abc-8def-000000000010",
};
const LATER = {
  createdAt: "2030-01-02T03:04:06.000Z",
  id: "018f0c7a-1234-7abc-8def-000000000011",
};

describe("market-rate-publication-checkpoint-service", () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(storage.get(key) ?? null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      (key: string, value: string) => {
        storage.set(key, value);
        return Promise.resolve();
      }
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    });
  });

  it("persists the publication timestamp and tie-break identity across reads", async () => {
    await saveMarketRatePublicationCheckpoint(EARLIER);

    await expect(readMarketRatePublicationCheckpoint()).resolves.toEqual(EARLIER);
  });

  it("does not let a slower concurrent refresh regress the durable checkpoint", async () => {
    await saveMarketRatePublicationCheckpoint(LATER);
    await saveMarketRatePublicationCheckpoint(EARLIER);

    await expect(readMarketRatePublicationCheckpoint()).resolves.toEqual(LATER);
  });

  it("uses the publication identity as the tie-breaker for equal timestamps", async () => {
    const lowerIdentity = { ...LATER, id: EARLIER.id };
    await saveMarketRatePublicationCheckpoint(LATER);
    await saveMarketRatePublicationCheckpoint(lowerIdentity);

    await expect(readMarketRatePublicationCheckpoint()).resolves.toEqual(LATER);
  });

  it("removes malformed transport metadata and safely restarts from no checkpoint", async () => {
    storage.set("@monyvi/market-rates/publication-checkpoint/v1", "not-json");

    await expect(readMarketRatePublicationCheckpoint()).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "@monyvi/market-rates/publication-checkpoint/v1"
    );
  });
});
