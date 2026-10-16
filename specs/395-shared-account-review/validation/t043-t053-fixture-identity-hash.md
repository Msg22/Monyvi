# #395 — T043/T053 canonical fixture queue identity + real SHA-256 pull admission

**TEST FIXTURE ONLY.** Exact immutable GitData parent `5559ae21ddab0bbc0872dc7e41ff0af741eafe4b`, tree `1b8adf3f768fd5a4c4773baa29c8a279b784e8cd`. Scope is only the one shared SQLite fixture helper, two dedicated root pull test suites, and this report. No production root, capture, sync, authentication, schema, SQL or runtime code is changed.

## Exact changed-only blobs

| Owned path | Immutable parent blob | New blob |
| --- | --- | --- |
| `apps/mobile/__tests__/services/account-review-save-sqlite-test-helpers.ts` | `47803c3eeb6aeae1cc7ccefa2b81c62431647dd9` | `53eac3c7af06eca7dc3227bd602675bc81cbc1c0` |
| `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` | `66b7111bae5ae94cf6e9329ef4c086bbedac3734` | `7debe5da5775fea42310dbc99bae253f7e8c5f13` |
| `apps/mobile/__tests__/services/financial-action-root-pull-integration.test.ts` | `0e38450bfd86e58938ac19c130dd1e98b7f9b6fa` | `fdf9325bcc41190f33550c5deabf27eedcc9ac3b` |
| `specs/395-shared-account-review/validation/t043-t053-fixture-identity-hash.md` | NEW | This report |

## 1. Actual owned queue and exact SMS review session

Root wave7 reproduced a failure in the **test helper** `seedDraftsWithVersion`: it persisted the queue ID and all draft `queue_id` values as `testUuid(950)`, even when its input canonical `AccountReviewSession.sessionId` differed. Queue/draft owner was also hard-coded to `OWNER`. The real private capture correctly checks that the queue header and *original cached* SMS drafts equal the source's owned `sessionId` and authenticated owner, so unrelated happy path assertions never ran.

For both v2 and explicit legacy-v1 seed entrypoints, the fixture now persists exactly:
- `SmsReviewQueue._raw.id = session.sessionId`
- `SmsReviewQueue.userId = session.ownerId`
- `SmsReviewDraftItem.queueId = session.sessionId`
- `SmsReviewDraftItem.userId = session.ownerId`

**Unchanged:** draft physical IDs `testUuid(951 + index)`, original selection/position/parsedAt, SMS fingerprints, source transaction, real `encodeSmsReviewDraftV2`/strict `smsReviewDraftPayloadV2Schema` bytes, v1 legacy encoder and all original financial/SMS assertions. This is identity coherence at the fixture boundary, NOT relaxed production validation, not remapping a negative source, and not inventing a new queue UUID.

The separately owned `account-review-local-recovery-test-harness.ts` has the old historical `seedBoundSmsReview` bridge which checks if the seeded queue already equals `fixture.session.sessionId`. With this fix that check now returns without performing its old replace/rebind; therefore no out-of-scope edit to that harness is required. Static inspection of the directly affected Save, Save-intent and Save-boundaries suites found no out-of-lease assertion hard-coded to `testUuid(950)`. The only direct old950 uses in those inspected fixtures were the three removed helper assignments. Genuine negative owner/queue/session mismatches in other tests stay as authored.

## 2. Expo Crypto's Jest boundary must calculate the actual hash

The real selected Save fixture constructs/commits the financial action root using the test harness's **Node `createHash("sha256")`** provider. On pull, production `checkedCloudActionRoot` reads the actual canonical envelope, reserializes it, calls `Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, envelope.payloadJson)`, then compares that hex result to the stored `payloadHash`. Under the globally provided `jest-expo` mock `expo-crypto` does not furnish the equivalent real SHA-256 result. This produces `financial_action_root_pull_payload_hash_mismatch` even when the root comes unmodified from a real SQLite Save. It is a **test native-crypto mismatch**, not authorization to relax real signed/hash identity validation.

Both *exact* pull test files now hoist a file-scoped `jest.mock("expo-crypto", factory)` returning:
- `CryptoDigestAlgorithm.SHA256 = "SHA-256"`
- `digestStringAsync(algorithm, text)` that rejects an unexpected algorithm and resolves **Node's real SHA-256 digest of those exact UTF-8 bytes** using `createHash("sha256").update(text, "utf8").digest("hex")`
- `randomUUID` using the genuine Node cryptographic UUID generator, not an empty fallback.

This matches the proven app-local pattern in `account-review-source-adapter-service.test.ts` and replaces **only the native test crypto interface**. There is no constant/fixture-specific digest, `hashFinancialActionEnvelope` mock, SUT mock, validator override, custom JSON stringifier, faked accepted RPC or source change. P05's forged payload/hash and P04/P07 rejection assertions still call the real pull validator; their failures are not suppressed or artificially passed.

## Preserved actual proof

- All **seven P01–P07** tests remain: real SQLite, authenticated owned-root update/ID remap, private retention against remote injection, accepted terminal private clearing, foreign owner rejection, immutable action/hash substitution rejection, independent new-cloud-root private `null`, and full rollback of malformed pull.
- All **seven R01–R07** tests remain: actual dedicated PostgREST fetch, actual SDK `synchronize()` retaining/clearing private, actual production `atomic-pull-strategies.pullChanges` nonempty root and owner-switch scope fence, unsupported-state preservation, and legacy metal pull. No pull/coordinator/network/SQLite service is mocked.
- The shared seed helper's other seeded financial accounts/categories/fingerprints, model registry, prepared operations and physical snapshots are untouched.
- This change cannot assert Green until Root executes the grouped suites, including T043 real capture, T053 physical pull, and pre-existing Save/negative/legacy cases.

**NOT RUN:** Jest, SQLite, TypeScript, lint, formatter, generator, SQL/pgTAP, CI, provider, hosted Supabase, native/emulator/device or Maestro. No additional source files or out-of-lease assertions edited. No Git refs/branches/push/PR/comments, delegation or Codex handoff.

**T043/T053 TEST FIXTURE SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
