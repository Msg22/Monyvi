# #395 T043/T053 — final bounded private-storage repair

**Immutable parent:** `51b0c14134938c7a9e04401480ba2202f6cb6e63`  
**Wave:** exclusive two-file source/test-hygiene repair plus this NEW validation report. Root owns regeneration, tests, integration, and downstream physical SQLite proof. **NOT RUN by this worker.**

## Root admission and exact repair

Root observed a valid Watermelon-only version31 private column, preserving the generated public Supabase and Base type hashes, plus deterministic generator output. The generator batch was **19 PASS / 1 FAIL of 20**, where the last test failed on Prettier's legal trailing comma following `isOptional: true`. The private-schema batch was **39 PASS / 1 FAIL of 40**, with its remaining failure deliberately authored for SMS queue/session binding.

| Changed path | Exact before blob at parent | New Git blob |
| --- | --- | --- |
| `packages/logic/src/financial-actions/review-local-recovery.ts` | `66805109944eee6cac777b8ea47d6f13dff18921` | `72a53bdbe5cd897f0cdcb7d23e430ce42325b24a` |
| `scripts/__tests__/account-review-local-recovery-schema.test.ts` | `d34b9f1076021f1b821fc1affece98018f12a81e` | `740bd02c7cc42b2fd33ba472db4df64abbbbbe77` |
| `specs/395-shared-account-review/validation/t043-t053-storage-final-repair.md` | NEW | This commit's validation blob |

The private parser now performs SMS-specific root-bound validation **after** parsing the strict nine-key canonical private shape and comparing `actionId`, `ownerId`, and `sessionId` with `expectedRoot`. For `expectedRoot.source === "SMS"`, `queuePreimage.id` and **each** `smsDrafts[].queueId` must equal the authenticated `expectedRoot.sessionId`. Missing SMS queue continues to fail at the pre-existing source check. Voice continues to require `queuePreimage: null` and zero SMS drafts. The intentionally structurally valid private-session-tamper fixture remains valid at `safeParse` and is rejected only at the expected root-bound reader.

The generator's **two** pre-existing assertions now tolerate an **optional** comma after `isOptional: true`. They continue to require the exact `local_recovery_snapshot_json` name, `type: "string"`, `isOptional: true`, and the existing separate exact-one column count. No AST scope relaxation, generated output, base/public cloud data or nullable/column semantics changed.

## Required Root follow-up: existing fixture compatibility

**Important test-only limitation:** the existing synthetic `smsSnapshot()` in the separately owned `packages/logic/src/financial-actions/__tests__/review-local-recovery.test.ts` sets private `sessionId = REVIEW_SESSION_ID` (`3333…`) but its queue header and draft `queueId = UUID_QUEUE` (`5555…`). The new contract correctly rejects it on root-bound SMS parsing.

Two existing positive callers (`accepts a complete bounded SMS snapshot` and `requires canonical distinct ASCII-sorted default predecessor action IDs`) still call `decode(smsSnapshot(), expectedRoot())`. They are now expected to fail until the **separately owned** Jest fixture reconciles its normally valid SMS root/queue identity. Preserve the intentional mismatched-queue **negative** test added in the prior wave by constructing mismatch only for that negative path; do not remove root-bound queue validation or weaken the ownership/shape rules. No Jest fixture edits are permitted under this lease. This consequence is source-observed, **not an executed test result**, and blocks any blanket Green claim.

No numeric `payloadVersion`/`position` converter was added. Safe, lossless restoration into actual Watermelon numeric fields remains a separately authorized downstream recovery-writer obligation; current canonical private strings are unchanged.

## Remaining verification and exact boundaries

Root alone performs the real generator/formatting, Node Jest, type/lint, and subsequent SQLite migration, capture and owned pull/upsert proof. Do not claim passing test counts beyond the **previous Root observations** above. No migration history, existing Jest private recovery test, generator implementation, local schema source, generated schema/Base/public types, hook, SQL, panel or sync file changed in this commit.

**NOT RUN:** Node tests, Jest, strict TypeScript, ESLint, Prettier, generator, SQLite, SQL, CI, provider, emulator, native worker, remote host/deployment. No branch/ref changes, push, PR/comments, delegation or Codex handoff. GitData blob/tree/unreferenced-commit creation only.

**SOURCE RELEASED — STOP.**
