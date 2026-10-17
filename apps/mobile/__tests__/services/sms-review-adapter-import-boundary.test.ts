/** Snapshot-driven Voice imports must not initialize the SMS SQLite namespace. */
jest.mock("@monyvi/db", () => {
  throw new Error("Snapshot adapter eagerly imported the SMS database runtime");
});
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: jest.fn((): never => {
    throw new Error("Importing an adapter must not read a snapshot");
  }),
}));
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn((): never => {
    throw new Error("Importing an adapter must not request an actor");
  }),
}));

import {
  createVoiceAccountReviewSession,
  createSmsAccountReviewSession,
  createCompleteSmsAccountReviewSession,
} from "@/services/account-review-source-adapter-service";
import { loadAccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import { assertExpectedCurrentUser } from "@/services/user-data-access";

describe("#395 snapshot adapter import boundary", () => {
  it("exposes Voice and SMS entrypoints without loading SMS storage or invoking snapshot ports", () => {
    expect(typeof createVoiceAccountReviewSession).toBe("function");
    expect(typeof createSmsAccountReviewSession).toBe("function");
    expect(typeof createCompleteSmsAccountReviewSession).toBe("function");
    expect(loadAccountReviewAccountSnapshots).not.toHaveBeenCalled();
    expect(assertExpectedCurrentUser).not.toHaveBeenCalled();
  });
});
