# #395 T054 — Voice/SMS route-boundary tests-first handoff

**Mode:** TESTS ONLY, owner-gated. **Exact parent:** `134a332e1aa0a749f91f1b3d76d1d18a03d1f601`, parent tree `259cc56978511e5894daf33a3423b0209857b417`. Authority is `1264134305c126a7836cf09e8f7843609a8c8555`, six published contracts under `specs/395-shared-account-review/contracts`. No production routes, hooks, registry, foundation, capture, pull, SQL, schemas, generated files or UI components changed.

## Changed-only paths and blobs

| Scoped file | Parent | Authored blob |
| --- | --- | --- |
| `apps/mobile/__tests__/hooks/voice-flow-review-params.test.ts` | NEW | `0435ea3462df211fa4d91dc51dfa5bb50c02be61` |
| `apps/mobile/__tests__/app/voice-review-v2.test.tsx` | NEW | `09d6d6ef07155ab5e751d8c5a4a590e742079973` |
| `apps/mobile/__tests__/app/sms-review-v2.test.tsx` | NEW | `814f8ad0e2e5f5555bf01575c0fab174d81d0e4b` |
| This report | NEW | Changed-only tree |

**Case count: 20 parameter-expanded scenarios**, 19 `it`/group declarations: Voice serializer V01–V04 (4), Voice route VR01 (1), VR02 (two malformed subcases), VR03–VR07 (5) = **8**, SMS route SR01–SR08 = **8**. No counts claimed as executed. Existing `voice-review-navigation.test.tsx`, `sms-review.test.tsx`, T030 hook suites, T048/T053 physical suites, and all other tests remain byte-for-byte untouched.

## Runtime facts observed at exact parent, expected behavioral Reds

- **Voice transport:** The real `hooks/voice-flow-submission.ts:118–129` `serializeAiReviewParams` omits the genuine validated `AiVoiceParserSuccess.reviewSession`. The canonical serializer tests use the actual synthetic `makeSaveFixture`, `AiVoiceParserSuccess` type and strict `accountReviewSessionSchema` with transport-only Date reconstruction, not a copied provider DTO. V01 checks original owner/session/revisions/row IDs/group identity/selected intent, V02 actual `Date` roundtrip, V03 original group/Cash content, V04 legacy params compatibility with NO fabricated V2. V01–V03 are source-proven Reds until transport is added; V04 is a V1 compatibility assertion.
- **Voice page:** `app/(private)/voice-review.tsx` currently casts untrusted `JSON.parse` arrays to `ReviewableTransaction[]` and always calls legacy `batchCreateTransactions`. Tests render the **real route**, mocking only UI, actor/provider and the account-review financial writer boundary. VR01 expects the authenticated canonical VOICE facade input and Date-bearing parsed session; VR02 malformed/incomplete JSON, VR03 foreign actor, VR04 mismatched source forbid legacy UI/Save fallback. VR05 passes the frozen `{session,intent}` through the real `freezeSelectedAccountReview` verifier into the approved `saveSelectedAccountReview` writer interface, with a deferred mock **only at the financial persistence boundary**, and requires navigation after commit. VR06 requires an atomic failure to preserve current review choices and never call legacy Save. VR07 intentionally asserts v1 legacy selected-Save and original-tab navigation still work when V2 is absent. Tests also prove zero extra parser/provider calls from the review route.
- **SMS page:** `app/(private)/sms-review.tsx` currently derives index-based selections from `useSmsReviewDraftQueue` and writes through legacy `saveSelectedSmsReviewDrafts`. The new tests render the real page and mock only owned queue/storage, authenticated read, external UI/financial transports; they additionally feed the **route-provided typed facade input to the REAL `useAccountReview` hook**, whose `loadOrBootstrapOwnedSmsReviewSession` boundary supplies an exact canonical session (not a fake reducer). SR01 proves queue=session/owner and actual facade read, SR02 invokes selected Save with that loaded session/frozen original intent and requires atomic success before navigation or clearing volatile scan data, SR03 failed Save retains canonical data and drafts, SR04 Review later clears transient scan UI only (never deletes durable queue/drafts), SR05 stale callback after actor loss cannot write, SR06 conflicting queue/session ID fails closed, SR07 foreign active actor is never allowed to load/save original owner's data, SR08 refuses an old displayed SMS fingerprint offered as a stale Save session while preserving the actual owned facade.
- **Real source contracts:** `UseAccountReviewInput` is the preexisting `{ mode: "VOICE"; voiceSession; ownerId; sessionId; signal? }` or `{ mode: "SMS"; queueId; ownerId; sessionId; signal? }` discriminated union; `useAccountReview` controls canonical revision, command serialization and cancellation. Financial Save is the actual `createAccountReviewSaveService` contract taking `ReviewSaveInput = {session, intent}` with `AccountReviewSaveResult`; only its external write boundary is mocked. The strict schema, real freeze validator and facade hook remain unmocked. SMS lease acquisition, queue publishing, legacy v1 transport and existing voice parser response flow are not altered by these tests.

## Minimal proposed opt-in V2 presentational boundary

Since current `TransactionReviewProps` has no V2 prop, tests define **test-local expected additive interface**, not a production/debug DTO or alternate reducer:

```ts
interface CanonicalV2ReviewBoundary {
  readonly input: UseAccountReviewInput;
  readonly onSaveSelected: (session: AccountReviewSession) => Promise<void>;
}
// TransactionReview: readonly accountReview?: CanonicalV2ReviewBoundary
```

Routes must derive inputs only from verified current owner and original parser/published owned queue authority. `onSaveSelected` consumes the **current canonical facade session** and its complete validated frozen intent; no index-based maps or `batchCreateTransactions`/legacy `saveSelectedSmsReviewDrafts` fallback for a V2 session. The production writer may implement this through a narrowly cohesive route-save service, but cannot invent another mutable business review state. The V1 `TransactionReview` input/callback remains compatible. This seam is a proposed minimal UI API: Root must pin its exact shape before granting production source.

Tests intentionally mock `TransactionReview` as a presentational boundary so this change is not coupled to T061's filter/projection/Panels implementation. **No new T061 filter/toolbar tests** or app UI/copy/maestro changes are included; independent Recovery projection and T072 rendered-copy owners remain separate.

## Case diagnostics / future source gates

Tests are intended to load at the current parent and fail behaviorally where runtime lacks session transport, strict route parsing, V2 facade props, and real selected-save routing. They do **not** import a nonexistent future `account-review-route-save` module, and do not mock the serializer or route SUTs. They do not claim results until Root runs the grouped suite. The no-extra-provider expectations are scoped to these route/transport surfaces, not an assertion that the original single parser invocation was exercised in these files.

**Before activation:** Root must admit T054 test Reds, resolve the proposed facade prop contract, preserve existing V1 navigation and SMS pending-edit tests, and accept T048/T049/T050/T051/T052/T053 local/remote, SQL, and recovery gates. T061 follows accepted T059/T060 projection and T054 route wiring; it must not compute counts/eligibility from `useTransactionReviewState`.

**NOT RUN:** Jest, TS, lint, formatting, SQLite, provider, Supabase hosted, emulator, native, CI, SQL, Maestro/device. No refs, branches, pushes, PR comments or metadata, delegation or Codex handoff. Root owns grouped checks and source grants.

**TESTS RELEASED — OWNERSHIP FROZEN — STOP.**
