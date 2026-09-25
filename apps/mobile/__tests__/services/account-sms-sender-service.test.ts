jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn(() => ({})) },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParent: jest.fn(),
}));

import type { Account } from "@monyvi/db";
import { queryChildrenOfOwnedParent } from "@/services/user-data-access";
import {
  normalizeAccountSmsSender,
  prepareReplaceAccountSmsSenders,
} from "@/services/account-sms-sender-service";

describe("normalizeAccountSmsSender", () => {
  it("collapses cosmetic whitespace before comparing sender aliases", () => {
    expect(normalizeAccountSmsSender("  CIB   Bank\tAlerts  ")).toBe(
      "cib bank alerts"
    );
  });
});

describe("prepareReplaceAccountSmsSenders", () => {
  it("prepares one update when only an existing alias's casing changes", async () => {
    const sender = {
      id: "sender-1",
      senderName: "CIB",
      deleted: false,
    };
    const account = { id: "account-1" };
    const query = { fetch: jest.fn().mockResolvedValue([sender]) };
    jest.mocked(queryChildrenOfOwnedParent).mockReturnValue(query as never);

    const result = await prepareReplaceAccountSmsSenders(
      account as Account,
      "user-1",
      ["cib"]
    );

    expect(result.preparedCreates).toHaveLength(0);
    expect(result.existingOperations).toHaveLength(1);
    expect(result.existingOperations[0]?.model).toBe(sender);
  });
});
