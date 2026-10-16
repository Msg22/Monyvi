# #395 T043/T053 — generator contract repair and focused private test boundary

**Repair source parent:** `6a5cdecfe9b96a5a25eb568a26d81ef11eb6a9d9`  
**Scope:** generator and local declaration, narrow frozen-test fixture correction, two downstream tests-first boundary assertions, this report. No generated schema, base model, Supabase type, migration history, private parser, foundation, sync or hosted edits.

## Root-observed Red and source diagnosis

- Root preflight: the generator returned a local column with `type: "undefined"`, so Root **rejected generated output before writing schema**. The existing private module exposes Watermelon `type: "string"`; `generateSchema()` expects `col.wmType` for its internal parsed-column projection. The SQL-owned `parseSupabaseTypes` rows already use `wmType`.
- Root batch before this repair: 15 PASS/5 FAIL of 20 Node generator assertions; private Zod 36 PASS/1 FAIL. These are **Root-reported previous Red results**, not results of this source revision.
- The one Zod failure was a **test fixture error**: changing private `ownerId` alone left `queuePreimage.userId` pointing to the old owner. Structural `safeParse` correctly rejected it before the expected authenticated-root mismatch check.

## Changed-only source, exact before/after Git blobs

| Owned path | Before at parent | New blob |
| --- | --- | --- |
| `scripts/transform-schema.js` | `53ab33499d4f8ca4fc938388f110a70954c9dc33` | `765f4ce2f368f90659c6f5ba2bfd22e5563629da` |
| `packages/db/src/local-schema/account-review-local-recovery-schema.ts` | `20e7ea4d26d9634dd4c79b5824631153f56d0eb2` | `acd93ebaa00cc8061a4b84df8d967b189614aa6a` |
| `packages/logic/src/financial-actions/__tests__/review-local-recovery.test.ts` | `c19374379b0b403050c0ae13a6f66131c5b36dc8` | `7f3e11b79a15fa44068333ef671566b937d46e73` |
| This validation file | NEW | Tracked in unreferenced GitData commit |

`localWatermelonColumns` now maps exactly the durable, typed local declaration `{name,type,isOptional?,isIndexed?}` to the existing schema generator's `{name,wmType,isOptional?,isIndexed?}`. Public column input arrays are not altered. The previous name-collision refusal remains; local duplicate names also refuse through the same set. Unexpected `type` values refuse before emitting invalid schema. `generateBaseModel`, `parseSupabaseTypes`, generated public types, and Metals overlays remain unchanged.

The TypeScript declaration now uses `satisfies readonly DeviceLocalWatermelonColumn[]` with an explicit `"string"|"number"|"boolean"` type boundary. The CommonJS Node22 `tsx/cjs` loader is retained. No dummy Supabase schema field was introduced.

The narrow existing `it.each(["actionId","ownerId","sessionId"])` fixture now changes the SMS queue header's `userId` alongside private `ownerId` only for that owner variant; both original assertions remain intact and public/authenticated-root mismatch remains the rejecting authority.

## Tests-first downstream findings — explicitly NOT resolved in this source wave

1. **Queue/session binding (new expected behavioral Red):** the private SMS synthetic baseline has `sessionId=33333333-3333-4333-8333-333333333333`, while its queue header and draft queue references use `55555555-5555-4555-8555-555555555555`. This is structurally closed but not an authenticated SMS queue/session identity. The new test proves a consistent queue/session positive, then expects the current parser to reject the mismatching baseline. The parser currently binds private `sessionId` to `expectedRoot.sessionId` but **does not require** `queuePreimage.id === expectedRoot.sessionId`. Expect **Red until a separately scoped parser/fixture reconciliation**, and adjust the existing SMS positive fixtures together rather than weakening the queue guard. Do not claim this test executed or passed.
2. **Numeric restoration conversion (new boundary assertions, downstream gap):** the two parameterized cases preserve canonical text `9007199254740992` for `payloadVersion` and `position` while asserting that `Number(...)` cannot be a safe integer. The `SmsReviewDraftItem` Watermelon columns are actual numbers, but **T051 must implement a lossless guarded decode/refusal before writing them**. There is no authorized restoration converter yet. These assertions do **not** prove restoration; they simply preserve the hazardous boundary without narrowing the agreed canonical revision-string schema.

## Root action / scope restrictions

- Root alone regenerates `packages/db/src/schema.ts` mechanically, inspects the generated root column, verifies public/base hashes and runs the consolidated Node/logic/Metals/TypeScript/formatter checks.
- Root should expect a separate intentional **new queue/session Red** from the private test until parser and synthetic valid SMS fixtures are jointly corrected under another explicit source grant. This is not a regression to conceal by deleting the test.
- No further production behavior was added to `review-local-recovery.ts`; its persisted nine keys, retention state union, canonical entity vocabulary, and private parsing API remain unchanged.
- The generator file is **891 lines in this unformatted blob**; normal formatting/limit confirmation belongs to Root. Named normalization function is 13 lines before formatting. No checks or generator execution were performed here.

**NOT RUN BY THIS WORKER:** Node `--test`, Jest, TypeScript, lint, Prettier, schema generator, SQLite, SQL, CI, provider, emulator, native worker, hosted calls or any Git ref/push/PR mutation. GitData blob/tree/unreferenced-commit creation only. **STOP after handoff.**
