import assert from "node:assert/strict";
import test from "node:test";
import { withTimeout } from "../../supabase/functions/_shared/promise-timeout";

test("does not invoke an operation when the external signal is already aborted", async () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error("cancelled"), { name: "AbortError" });
  controller.abort(reason);
  let invocationCount = 0;

  await assert.rejects(
    withTimeout(
      () => {
        invocationCount += 1;
        return Promise.resolve("unexpected");
      },
      1000,
      controller.signal
    ),
    reason
  );

  assert.equal(invocationCount, 0);
});
