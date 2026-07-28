const mockDigestStringAsync = jest.fn(
  (_algorithm: string, value: string): Promise<string> =>
    Promise.resolve(`digest:${value}`)
);
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (...args: readonly [string, string]): Promise<string> =>
    mockDigestStringAsync(...args),
  randomUUID: (): string => "uuid",
}));

import { createFilteredSmsAiRetryRequestKey } from "@/services/sms-parse-transport";

describe("SMS parse request identity", () => {
  it("derives one stable identity for the same filtered retry payload", async () => {
    const first = await createFilteredSmsAiRetryRequestKey("original", [
      "fp-b",
      "fp-a",
    ]);
    const second = await createFilteredSmsAiRetryRequestKey("original", [
      "fp-a",
      "fp-b",
    ]);

    expect(first).toBe(second);
    expect(first).toContain("sms-ai-filtered-retry-v1:original:fp-a:fp-b");
  });

  it("changes identity when the remaining candidate set changes", async () => {
    const first = await createFilteredSmsAiRetryRequestKey("original", [
      "fp-a",
    ]);
    const second = await createFilteredSmsAiRetryRequestKey("original", [
      "fp-b",
    ]);

    expect(first).not.toBe(second);
  });
});
