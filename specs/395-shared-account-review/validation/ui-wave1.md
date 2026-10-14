# #395 — UI Wave 1, T006/T008 test-only publication receipt

**Status: AUTHORED / PUBLISHED / WRITE OWNERSHIP RELEASED.** This is a bounded test handoff, not an implementation, passing test report or authorization for production behavior.

| Authority / ref | Exact value |
| --- | --- |
| Repository | `Msg22/Monyvi` |
| Exclusive worker branch | `codex/395-ui-worker` |
| Immutable parent before this leaf | `7e27eb55c642dccef44f4b977a8712ab320ecd18` |
| Parent of that base | `944cbafc7e7d9f36a13c75d20c0669204974db2b` (PR #396 planning head) |
| Trusted governing main | `7838df64eb9b3828c6e8f1a02f590b008d5435fd` |
| Frozen T004 wire source blob | `b6c513eec986b93158be51002487e6a39c84361b` |
| Approved B1 manifest | `sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0` |
| Approved B1 receipt blob | `f2fbd67fd350b08ed897995a7cca71f38940110b` |
| Test-only content checkpoint HEAD before this final receipt update | `eb7a2db196b9af54e5fb513e48ab184624589504` |

## 1. Branch creation and GitHub proof

Immediately before creation, an exact `refs/heads/codex/395-ui-worker` GET returned GitHub 404 and a branch-name search returned an empty set. The GitHub connector successfully created the branch from the **exact** immutable base `7e27eb55c642dccef44f4b977a8712ab320ecd18`; a subsequent exact-ref read showed that same starting head.

A first, durable checkpoint was published as this report at `f3a160564459a451ea7a21bd04ea779be373ed4d`. Test and fixture commits followed only on the new worker branch. No PR, issue, Page, main branch or other worker branch was mutated. No unpublished Core, native-wire, or root-local artifact was read or overwritten.

Before the final receipt update, `compare_commits` against the immutable base returned **ahead, seven commits, exactly four changed repository paths**, all on the allowed list. The branch's final head is the successor commit holding this receipt; inspect `refs/heads/codex/395-ui-worker` for that self-referential final SHA.

## 2. Exact writable path inventory and authored scope

| Changed path | Git blob before the final report commit | Actually authored |
| --- | --- | --- |
| `apps/mobile/__tests__/services/account-review-read-model-service.test.ts` | `15d2ae924e426f9fe50320f12c0b73e97a26ec3d` | **T006**, seven behavior-focused Jest cases |
| `apps/mobile/__tests__/e2e/account-review-fixtures.test.ts` | `87bb7d6970deb2f5ba9a972b88bb71f067d9b70a` | **T008**, fourteen direct Jest cases plus eight individually parameterized B1 count cases (22 cases) |
| `apps/mobile/e2e/fixtures/shared-account-review.json` | `9c3520032cde8ee2659232dc9bd245280a18ad0e` | Synthetic, current-user-bound *descriptor* catalogue; 15 scenes and M01–M20 mappings |
| `specs/395-shared-account-review/validation/ui-wave1.md` | updated in this final publication | This report: actual access, authorship, checks, API seams and release |

No production services, package exports, business logic, DB models, SQL, locales, account forms, Maestro YAML, shared test helpers, other specs, scripts or secrets were touched. The Core worker retains exclusive T005/T007 files.

## 3. T006: owned account read-model tests

The new `account-review-read-model-service.test.ts` specifies the frozen mobile API **`loadAccountReviewAccountSnapshots`**, expecting a privacy-safe context consistent with `accountReviewRequestContextSchema` from canonical `@monyvi/logic`. Tests use domain model `Pick<...>` fields rather than locally copied currency/account unions, `any`, or unsafe model casts. Source inspection of the actual base confirmed that the target service **does not yet exist** and the canonical schemas belong to the concurrent Core foundation wave.

Seven tests cover:

1. Owned active Bank/Cash/Wallet projections, preferred currency from the scoped profile and canonical request-context fields, including numeric card suffix `7 → "0007"`.
2. Provider privacy: no balance, account number, soft-deleted bank child/sender, foreign/deleted account or local default-metadata leakage.
3. Exactly one scoped active-account query, one scoped profile query and at most one batched child query per bank-details/sender table, without per-account N+1 reads.
4. Empty-account context preserves the current user's preferred currency without synthesizing an account.
5. Authenticated-user switching reloads data and does not leak a prior user's accounts or currency.
6. Missing owned profile fails closed rather than inventing a currency.
7. Scoped child-query failure propagates instead of being converted into apparently valid empty child metadata.

Test doubles intercept `@monyvi/db`, WatermelonDB `Q` and approved user-scope methods. They do not access a live database, user records or credentials. The positive output shape is a **test expectation** for the T010 implementer to reconcile; the wire freezes the loader name and parser request schema but does not spell out the loader's full argument/return signature. Do not silently treat this test assumption as an approved API expansion.

## 4. T008: deterministic, production-gated fixture tests

The descriptor catalogue records **15 synthetic review scenes** with source-local response references, syntactically valid, stable UUIDv4 row/session/group/account identifiers, and 14 distinct 64-hex synthetic SMS source fingerprints. Fingerprints are SHA-256 of fixture-specific synthetic seed labels; they are **not claimed** to be generated by the production SMS parser or proof that corresponding SMS has been delivered. The account catalogue is an approved **safe request-context shape**, not seeded WatermelonDB records or a real account owner. An owner binding must be resolved at runtime.

The fixture catalogue is **not** an independently copied runtime review domain schema. It contains small descriptive `issueTags`, counts, source refs and fixture intention. T015 must hydrate and validate sessions through the canonical `accountReviewSessionSchema` and current-owned data read model; labels/tags are never financial commands, account identity authorization or parser provenance. No raw SMS body, full account number, account balance, password, provider credential, hosted test account or customer information is included.

| Fixture scene | Expected total / needs review / actually selected |
| --- | --- |
| `r3-combined-en` (R3-05) | **7 / 5 / 2** — QNB3, CIB1, default2, one currency conflict |
| `r3-combined-ar` (R3-15) | **7 / 5 / 2** — Arabic RTL semantic counterpart |
| `r3-removed-undo` (R3-06) | **4 / 3 / 1** — removed QNB2, pending CIB1, selected default1 |
| `r3-default-only` (R3-07) | **2 / 0 / 2** |
| `r3-issues-only` (R3-08) | **4 / 4 / 0** — account, currency, amount, category |
| `r3-confirmed-feedback` (R3-09) | **4 / 0 / 1** — QNB/CIB confirmed, one selected |
| `r3-clean` (R3-10) | **2 / 0 / 2** |
| `r3-selected-empty` (R3-11) | **3 / 0 / 0** |
| `voice-currency-omitted` (M03) | **1 / 0 / 1** — proven omission uses EGP preferred, distinct from conflict |
| `r1-account-chooser` | **1 / 1 / 0** — no assumed selected account |
| `r3-currency-conflict` | **1 / 1 / 0** — EGP/USD unresolved; existing picker |
| `r3-sms-save-failure` | **2 / 1 / 1** — choices to retain; failure must be *injected elsewhere* |
| `sms-cash-ineligible` | **1 / 1 / 0** — ordinary SMS cannot default to Cash |
| `sms-review-restart` | **1 / 1 / 0** — fingerprint/draft state only; real restart owner-run |
| `sms-atm-transfer` | **1 / 0 / 1** — separate Bank source/Cash destination, unchanged amount |

All **M01–M20** IDs occur once in the separate coverage map, including cases that **must not pretend to be runnable via fixtures**. M12/M18 account-form changes, M14/M19 actual writer/SQL failures/CAS and retries, M15 device restart, M16 provider usage and M17 device visual/accessibility remain identified as separate service/pgTAP/component/owner-manual evidence. The JSON explicitly marks every scenario as authored-only and `maestroExecuted: false`.

T008 static tests verify catalogue privacy, canonical request-context schema consumption, all 20 case mappings, exact B1 counts, stable unique UUID/group links, appropriate SMS fingerprints/null Voice fingerprints, Cash SMS exclusion versus ATM Cash destination, group-confirmation versus row-selection, removed suggestions, and proven currency omission versus uncertainty.

The planned future T015 entry tests use **`loadAccountReviewFixtureSession(sceneId)`** as a proposed test-facing seam: explicit `EXPO_PUBLIC_MONYVI_TEST_MODE=e2e` and non-production runtime, current authenticated owner, canonical `accountReviewSessionSchema` hydration, Voice/session and SMS/fingerprint variants, signed-out/production/off-mode/unregistered-ID fail-closed behavior, and no test-only financial save shortcut. That function name/signature is **not** frozen by T004; the T015 owner/lead must reconcile this test-only seam before treating the tests as implementation-ready. Local SMS draft staging (if required) must go through the normal owner-scoped path; runtime financial saves must always use the approved complete writer rather than fixture-only persistence.

## 5. Actually performed verification — evidence boundary

- **GitHub branch absence:** VERIFIED twice, then created and exact-parent checked.
- **Immutable source reads:** VERIFIED at approved base/trusted governance. Inspected existing account/profile/bank/sender model fields, user-data-access helpers, test-mode configuration, SMS fixture parser, scoped read-model test conventions, TDD guide, Maestro workflow, manual M01–M20 and B1 binding authority. No unrelated or secret file reads.
- **GitHub receipt readback:** VERIFIED for both tests and fixture JSON; current fixture JSON parses successfully via the connected read and contains all M01–M20 IDs.
- **Static shape check (not Jest):** 15 scenes, 20 unique scenario IDs, 14 synthetic SMS source fingerprints, no scene count mismatches, allowed four-file compare, no `any` or unsafe model casts in the new test sources. These assertions were evaluated against the fetched/published data using an isolated local tool script, **not the project's test runner**.
- **Jest / TypeScript / ESLint / formatter / Red / Green:** **NOT RUN**.
- **Maestro YAML authoring/execution:** **NOT AUTHORIZED in this leaf / NOT RUN**.
- **Android/iOS device, emulator, hosted Supabase, provider, UI rendered comparison and accessibility:** **NOT RUN**.

Both intended production target services (`account-review-read-model-service.ts`, `account-review-fixture-service.ts`) are absent at pinned base, so the tests are expected to remain Red/unresolvable before T010/T015. This is **not** a measured Red run; root owns the focused Red batch after the frozen Core+UI test handoffs and may need to reconcile API seam names before implementation. No test pass or shipped fixture capability is asserted.

## 6. Blockers, ownership and frozen handoff

- **Core dependency:** T005 canonical Zod schemas, type exports/barrel and T007 parser test contracts are separate, exclusively Core-owned work; do not copy account/type/currency unions or modify Core files here.
- **T010 contract seam:** The frozen contract names `loadAccountReviewAccountSnapshots` and the canonical privacy-safe provider context. This test suite expects a no-argument, current-owner scoped loader returning that strict context. Lead/T010 implementer must explicitly accept or reconcile this signature against the published T004 shape before production authoring, without overriding financial identity protections.
- **T015 contract seam:** Fixture service path is frozen, but export/function signature is not. The proposed `loadAccountReviewFixtureSession(sceneId)` T008 entry contract needs lead/T015 acknowledgement; do not introduce a second unapproved schema or invoke financial writes by bypass.
- **Required later gates:** Root-led meaningful Red batch; T010/T015 implementation only on separate authorization, Green/integration checks later; authorized Maestro static authoring separately; owner device, real provider, keyboard, RTL, rendered and accessibility evidence remain independent. No emulator, hosted reset/seed/deploy or new mockups.

**Outcome: TEST AUTHORING COMPLETE / NO EXECUTED TEST RESULT / EXCLUSIVE WRITE SCOPE RELEASED.** All writes to `codex/395-ui-worker` and the four leaf files are **FROZEN** after this report commit. Normal ChatGPT → Antigravity → justified native fallback is the owner-approved routing (OpenCode excluded). Any further correction requires a new explicit grant; branch source/lease must be refreshed first.
