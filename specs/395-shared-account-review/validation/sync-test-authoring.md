# #395 T044 — standalone SMS review sync tests-only authoring

**Checkpoint:** 2026-10-15. Normal ChatGPT worker on the existing `codex/395-ui-worker` branch. Sole ownership of **new test files and this report**, no production source changes. Supplied immutable, unreferenced GitHub blobs:

- `account-review-sync.test.ts` source blob `3e1a3bbce508592ba7186055d581af36f4214dbc`.
- `account-review-sync-test-helpers.ts` source blob `2b1f06dbd8d24c42be22016e1ed3d3cea108c45a`.

## Test count, canonical data, and bounded changes

The resulting suite preserves **all 27 original `it` cases**, their titles, **49 `expect` calls**, initial real sync/coordinator imports, and original assertions. The existing Root-observed preliminary status was **21 PASS / 6 expected failures from unsupported new financial tuple**; these unregistered-RPC/collector failures are **not** evidence of a business rejection, and the feature remains unsupported until a separate activation gate. This checkpoint merely cleans the test authoring; it neither fixes nor activates sync.

The two incomplete-group negatives in the test at original locations around lines 258 and 290 retain their **complete surrounding `...positiveChanges` object** and exactly the same negative financial envelope. They replace only the unsafe indexed spread of `positiveChanges.financial_action_groups` with an explicit `created: [{...reviewBatchSaveRootRecord(), payload_json: JSON.stringify(incompleteEnvelope)}]`, `updated: []`, `deleted: []` member. No SUT mock, weakened negative, omitted table, or changed action root.

The former 888-line helper has been separated into the **byte-faithful canonical source fixture values** in `account-review-sync-canonical-test-fixtures.ts` and a focused builder facade in `account-review-sync-test-helpers.ts`. The facade re-exports all original canonical constants/envelopes, preserving test import paths. It extracts `reviewBatchSaveChanges`, `smsNewBankChanges`, and `atmTransferChanges` into typed small builders returning existing `NonNullable<SyncPushArgs["changes"][<table>]>` shapes, and per-financial-record helpers for the two Voice and two SMS transactions. Each call produces new table/record arrays; no shared mutation/caching and no mocked pure business source.

All original change-set fields and values are retained, including source IDs, selected transaction/transfer IDs, fingerprints, guard revisions, currency, signed/zero minor-unit effects, the BankDetails suffix, real `account_sms_senders.normalized_sender_name` and `sender_name`, and the exact `review.batch-save/v1` envelope. No invented `senderNumber`, test-only record schema cast, or new runtime implementation.

## Verification and remaining gaps

GitHub connector blob readback and source-level checks verified the original 27 test titles, 49 expectation calls, same physical table fields/amounts, four new paths and small helper function structure. This worker **did not run** Metro, Jest, TypeScript, lint/format, a hosted database, provider, device, or pgTAP. Actual post-cleanup tests are **NOT VERIFIED** here; Root must format and execute its single coherent local test batch and inspect compile errors separately from genuine unsupported-new-tuple assertions.

Full T044 work on restart recovery, queue predecessor sequencing, local action recovery and real SQL/CAS remains a different later authorization. No default registry activation, sync source/service, financial source, SQL, Save UI, queue, migration, PR, branch creation or main merge was performed.

**Ownership: test authoring source released and branch frozen after publication.**
