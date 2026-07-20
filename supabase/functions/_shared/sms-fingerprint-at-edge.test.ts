import assert from "node:assert/strict";
import test from "node:test";

import { computeSmsFingerprintAtEdge } from "./sms-fingerprint-at-edge.ts";

test("matches the mobile canonical fingerprint normalization", async () => {
  const fingerprint = await computeSmsFingerprintAtEdge({
    sender: "  QNB EGYPT ",
    body: "Purchase\u200b\r\n  EGP 10",
    receivedAtMs: 1_721_479_600_000,
  });

  assert.equal(
    fingerprint,
    "4d7f2d12d4aecb68f08ee070466c570b9d5dc840604b99ded5992f35ebdf3d41"
  );
});
