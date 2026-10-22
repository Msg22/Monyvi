# Foundation test-handoff audit — #395

Date: 2026-10-14. Read-only QA of the frozen local handoff in
`Monyvi-issue395-foundation-verification`: context base `7e27eb55`, Core
`3672b439`, UI `33afcb05`, as assigned by the lead. Core/UI corrections remain
owned by their remote authors; this report does not review their later heads.

## Outcome and evidence boundary

The tests contain useful negative schema cases, real parser entry-point calls,
query-count assertions and production/owner fixture guards. They are not yet a
validated behavioral Red boundary. The lead's prior batch reached zero behavior
tests because canonical/generated producers and several test mocks were not
loadable. This audit ran no shell commands, tests, formatter, provider calls,
emulator, SQL or deployment and makes no new execution claim.

Read the nine assigned test/fixture/report paths, T005–T016, M01–M20, frozen
wire/parser/review contracts and the allowed current parser/read-helper sources.
Scope excludes implementation, test edits, approved artifacts and the root
ledger. Route the findings below to the original authors, then rerun only the
affected consolidated batch.

## Actionable findings

| ID  | Priority / owner               | Evidence and minimum correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | P1 / UI, T010 producer owner   | `account-review-read-model-service.test.ts`, active-owned/context and privacy tests, parses the entire loader result as the strict provider request and forbids `isDefault`. That proves provider privacy but eliminates the local default fact needed by M01/M02. Assert the local owned snapshots and default flags separately, then validate/serialize only `providerContext` against `accountReviewRequestContextSchema`. The UI receipt itself identifies its loader return shape as an assumption, not frozen authority.                                                                                                                                                                                              |
| F02 | P1 / Core                      | `account-review-parser-adapters.test.ts`, `nestedValues` and currency/account-state helpers, recursively searches arbitrary nested objects for evidence words. A returned raw payload could satisfy `ambiguous`/`unknown` while the normalized row still receives preferred currency, an account or no hard review reason. V1 `not.toContain("omitted")` also passes on an empty evidence list. Assert the actual typed normalized row: unconfirmed currency with its exact reason, unresolved assignment/null account, preserved required category ID and financial amount, and the appropriate hard reason. For v1 assert explicit `legacy_unknown` provenance rather than absence of one word. Keep one-call assertions. |
| F03 | P1 / Core                      | The SMS test named “retains existing capacity/quota/refusal semantics with no second provider request” accepts `hasError                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |     | availability !== undefined`. Its success-body `{reason, availableAt}`can merely fail the missing-transactions envelope and satisfy the assertion. Supply the existing transport's real refusal envelope/status, assert exact`availability.reason === "burst_limit"`, its availability time, unresolved candidate/retry semantics and no durable negative, plus one original transport invocation. A generic response-invalid failure must fail this test. |
| F04 | P2 / Core                      | `schemas.test.ts`, conflicting linked currency/provider/card test, claims row retention but asserts `sms.transactions[0]` from the unchanged input fixture after `safeParse` fails. Those amount/category assertions do not test retention. Keep this as a strict advisory rejection test; put financial retention assertions on the real normalization/adapter result. Likewise Edge checks on input `response.transactions[0]`/`response.completionStatus` in `account-review-edge-contract.test.ts` validate fixtures, not generated output. Compare successfully parsed output where output parity is intended.                                                                                                         |
| F05 | P1 / Core, T011 producer owner | Edge tests compare validator acceptance and ad hoc `z.toJSONSchema` projections, but do not inspect the generated parity hash or the actual supported Gemini/DeepInfra provider projection. Two identical unsupported projections can pass. Consume the generator's actual provider projection and canonical parity marker, assert standalone generation and byte/hash parity, then exercise source-specific schema fixtures. Keep acceptance tests; add parsed-output parity for defaults/transforms. These are local projection tests, not proof of live provider acceptance.                                                                                                                                             |
| F06 | P2 / Core                      | All raw fixture builders in `fixtures.ts` omit explicit return annotations; only source/span input tokens derive from canonical types. Literal return fields widen to generic strings, so the receipt's authoritative-type claim is incomplete. Annotate positive raw builders with inferred canonical raw schema input/output types, keeping normalized `AccountReviewRow` separate. Return `AccountReviewEvidenceSpan` for the span builder. Derive the source discriminator from the canonical row; do not copy unions, cast through `unknown`, add `any`, or add normalized `categoryId` to provider rows.                                                                                                              |
| F07 | P2 / UI                        | The mocked `getCurrentUserDataScope` in `account-review-read-model-service.test.ts` captures mutable `currentOwnerId` in each query closure. The real scope captures one immutable user ID at creation (`user-data-access.ts:145–159`). Capture the mock owner's ID once; add a deferred-read owner-switch case so a stale first-owner operation cannot return data into the successor session. Existing sequential-switch coverage is useful but does not cover an in-flight change.                                                                                                                                                                                                                                       |
| F08 | P1 / UI, T015 producer owner   | Fixture-entry tests assert `session.ownerId` after switching users while the account loader always returns the same static catalog. A loader that only relabels the owner could pass. Make the dependency return different owned snapshots per owner; include foreign/deleted/revoked or missing referenced accounts and assert reject/recovery or an owned mapping with no stale IDs. Validate the canonical session returned by the real fixture SUT. The descriptor's owner-binding string and fixed account UUIDs are not ownership evidence.                                                                                                                                                                           |
| F09 | P2 / UI                        | T008's B1-count, omission, Cash exclusion and confirmed/selected checks inspect descriptors directly. They establish catalog integrity, not resolver/reducer/projection behavior or journeys. Retain them with that label. Once the real fixture producer is available, validate every registered scene through the canonical session schema and assert shaped state/counts, not only the two happy scene entries. M12/M18, writer faults/CAS, restart, live provider usage and rendered/accessibility checks remain explicitly separate.                                                                                                                                                                                   |

Known load blockers already under author correction: mock factories referencing
`syntheticSession`/`currentOwnerId`, and the absent read-model dependency mock
in fixture tests. Use hoist-safe factories and `{ virtual: true }` only for a
genuinely missing mocked dependency. Do not mock the schema, fixture service or
parser SUT to manufacture a Red/Green result. No duplicate correction was made
by this audit.

## Raw category and optional/default semantics

Current source evidence does not support weakening the category tests:

- Voice provider projection requires `categorySystemName` in
  `supabase/functions/parse-voice/index.ts:147–182`; its current transaction
  interface also requires a string. The mobile Voice raw schema requires a
  string before `parseCategory` supplies the normalized category ID.
- SMS provider projection requires it at
  `supabase/functions/_shared/sms-ai/sms-ai-prompt.ts:378–410`. The provider
  interface requires a string; the executor grounds then validates the result.
  `sms-provider-transaction-validator.ts:75–76` requires a string in the
  accessible category set. The mobile SMS raw schema also requires a string.
- `packages/logic/src/types.ts` makes normalized
  `ReviewableTransaction.categoryId` required. That constraint belongs to the
  normalized transaction snapshot, not a copied raw provider row.
- Existing optional/default fields remain source-specific. For example mobile
  SMS defaults omitted `isAtmWithdrawal` to false and permits omitted
  `cardLast4`; Voice has different required/nullable original fields. Preserve
  those rules in v1 and composed v2 tests. Do not make every original field
  mandatory because new v2 evidence fields are mandatory.

Keep the current Voice null-category rejection. Add genuinely missing-category
cases for each raw source and an explicit optional SMS-field/default regression;
the current test title says missing/null but its broken-row table only supplies
null. Keep a separate normalized row/session test that rejects absent/null
`categoryId`. Generic wording about legacy optional/default behavior is not
proof that `categorySystemName` itself is optional in the current producers.

## Minimum technical producer boundary

The lead accepted separating the local snapshot from its provider projection.
Recommended mobile-only types, with fields derived from existing authoritative
types:

- `AccountReviewLocalAccountSnapshot`: all fields of
  `AccountReviewRequestContext["accounts"][number]`, plus local-only
  `isDefault: Account["isDefault"]`.
- `AccountReviewAccountSnapshots`: `ownerId` from
  `CurrentUserDataScope["userId"]`, local `preferredCurrency`, readonly local
  `accounts`, and `providerContext: AccountReviewRequestContext`.
- `loadAccountReviewAccountSnapshots()` returns that owned read model. Its
  provider projection contains only the frozen request fields and account
  context whitelist; no owner/default flag, balance or full identifier. Query
  current-owner active roots once and child tables through owned parent scope.
  Capture one owner for the operation and revalidate before publishing it.

These are plain local read-model types, not persisted columns or a new wire
wrapper. Use the existing T004 inferred `AccountReviewRequestContext` for the
provider member; do not duplicate its domain vocabulary. Review identity
revisions remain review-snapshot revisions, not invented account DB fields.

For the first executable schema behavior batch, supply the real canonical
`packages/logic/src/account-review/schemas.ts` export surface required by these
tests: request context, evidence span, account/currency evidence, suggestion,
Voice/SMS v2 success, currency, assignment, group, row and session schemas;
infer/export `AccountReviewEvidenceSpan`, `AccountReviewRow` and request/session
types. Expose the canonical request/session exports through the existing logic
barrel for mobile consumption. Implement no pass-through or test-only schema.
Generated Edge validation/projection/parity outputs are a separate T011
boundary.

The existing `parseVoiceWithAi(options)` and
`parseSmsWithAi(candidates, context, onProgress?, signal?, expectedUserId?, requestContext?, requestKey?)`
signatures remain the transport entry points;
`parseAiResponse(data, submittedFingerprints)` alone has no submitted SMS
body/sender map for grounding. Put source-aware grounding in the actual source
normalization/adapter boundary with the submitted source context, not a copied
test helper. Assert typed output from `normalizeAccountReviewParserResult` or
the agreed typed parser result rather than recursive key discovery.

Before accepting foundation completion, the lead must distinguish load/import
failures from measured behavioral Red, then record corrected executable cases
and affected-batch results. This report authorizes no production edits and does
not mark T005–T016 complete.

## Coverage honesty and release

Both frozen receipts explicitly say their authors did not run Jest, TypeScript,
formatter, emulator or live providers. The JSON labels M01–M20 as mappings,
authoring-only, with `maestroExecuted: false`; no false E2E/provider execution
claim was found. No `any` or unsafe model cast was found in the inspected test
sources. Synthetic category mocks and descriptor checks still need the stronger
real-boundary assertions above; their passing would not prove ownership,
provider interpretation or complete financial saves.

Only this report was written. Test/production files, approved sources, task
checkboxes and the root ledger were untouched. Report ownership is released to
the lead; remote authors retain their correction ownership.
