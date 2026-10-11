# #391 Structured Speckit Cross-Artifact Analysis — READ-ONLY Semantic Pass

**Date:** 2026-10-12  
**Scope:** Completed authored `spec.md`, `plan.md`, `tasks.md`, `contracts/audio-validation-contract.md` and `checklists/manual-plan.md` on #391 research branch expected `a7e1e00e118b4b8a989387d48181fdde0c821f3d`, plus trusted constitution `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` and published Voice `f625183373e29d372b658c10b3848a217477400a`.  
**Method:** Full **structured read-only semantic pass** following the six detection categories and severity rubric of `.agent/workflows/speckit.analyze.md`: inventory → duplication → ambiguity → underspecification → constitution → coverage → inconsistency. The author inspected the five staged documents by their **unreferenced Git blobs** after spec/plan/tasks were complete; the branch was not mutated for analysis. No executable `/speckit.analyze` command, shell prerequisite, code/test run, Deno/FFmpeg, provider or device work occurred. Root alone runs local `SPECIFY_FEATURE=391-voice-empty-audio-guard` prerequisites and accepts/repeats the canonical analyzer before production.

## Structured inventories and coverage

| Inventory | Actual drafted count | Cross-check |
| --- | ---: | --- |
| User stories | **3**: US1 local cleanup READY for RED, US2 speech BLOCKED, US3 identity/UX BLOCKED | Every story has independent Given/When/Then cases and a named gate |
| Functional requirements | **20**: FR-001–FR-020 | Sequential unique IDs; each has task coverage below |
| Nonfunctional requirements | **6**: NFR-001–NFR-006 | Resource, false-negative quality, privacy, compatibility, cancellation, evidence |
| Success criteria | **9**: SC-001–SC-009 | Each has an evidence owner and objective or explicit measured gate |
| Tasks | **32**: T001–T032, all `- [ ]` | Sequential, no completion claimed; phases and dependencies coherent |
| Manual/owner cases | **19**: M391-01–M391-19, all NOT RUN/BLOCKED | Native + audio + runtime + account/race/latency boundaries distinguished |
| Required documents | **6** exact new files | Spec, plan, tasks, proposed contract, this analysis, manual plan; no extra document artifact |
| Research artifacts | **9**, already existing | Source-only prototype and templates linked, **not regenerated or executed** |

### Requirement-to-task traceability

| Requirement IDs | Explicit task coverage | Status / independent boundary |
| --- | --- | --- |
| FR-001–FR-003 (SDK55 cleanup, idempotence, native/generation safety) | T004–T010; T028–T031 | READY for TEST-ONLY RED; no production edit until root RED accepted |
| FR-004–FR-005 (actual bytes/container, no metadata speech proof) | T017, T019, T021–T023 | BLOCKED on supported-format/validator decision |
| FR-006 (quiet Arabic/English/code-switch high-recall speech) | T011–T016, T019, T021–T023, T026 | BLOCKED on license, thresholds and runtime/Edge evidence |
| FR-007–FR-010 (auth/consent, reservation/start, release and uncertain failure) | T017–T023, T026, T030 | BLOCKED on HTTP/SQL lease and exact accounting contract |
| FR-011–FR-012 (35-day replay, released terminal, parallel same-key validators) | T018, T020–T023, T026, T030 | BLOCKED; explicit SQL mismatch/race tests precede source |
| FR-013–FR-014 (30s local versus server; client <1.5s) | T017, T018, T024, T026 | Client unchanged; BLOCKED on server duration/padding/short speech decisions |
| FR-015 (no invented refusal copy/HTTP body) | T017, T024–T025, T027 | BLOCKED on owner/product contract |
| FR-016 (current provider/success/quota/Manual/#384) | T017–T023, T025–T026, T028–T030 | Positive controls and independent review required |
| FR-017 (decoder/VAD Edge feasibility) | T011–T016, T030 | BLOCKED/UNMEASURED |
| FR-018 (privacy/minimization) | T013–T016, T019–T020, T026, T030 | Private data must not enter fixtures/logs |
| FR-019 (actual RED/GREEN) | T005–T009, T019–T023, T029 | Root mandatory RED and final batch; no execution here |
| FR-020 (branch/source isolation) | T001–T004, T028–T032 | Startup worker/389/SQL untouched |
| NFR-001 (resources) | T015–T016, T030 | Actual local/hosted measurement BLOCKED |
| NFR-002 (false negatives) | T013–T016, T026, T031 | Licensed positive speech BLOCKED |
| NFR-003 (privacy) | T013, T019–T020, T026, T030–T031 | Owner and independent privacy proof |
| NFR-004 (dependency/hosted compatibility) | T004, T008, T012, T022, T028–T030 | Additional packages/services/deployments NOT authorized |
| NFR-005 (cancellation/resource safety) | T006, T009, T018, T020, T026, T030 | SDK cleanup independently testable; server lease gated |
| NFR-006 (honest evidence/quality) | T002–T003, T007, T009–T010, T021, T023, T029–T032 | Root-owned real tests/approval |
| SC-001–SC-002 (cleanup) | T005–T010 | SDK55 RED → import-only source → focused GREEN |
| SC-003–SC-006 (actual validation, quiet recall, Edge viability, replay races) | T011–T023, T026, T030 | Speech block not satisfied |
| SC-007–SC-009 (positive controls, manual evidence, final checks) | T024–T032 | Owner/root remain responsible |

**Coverage result:** 20/20 FR, 6/6 NFR, 9/9 SC have at least one mapped task; all 32 tasks fall into owned setup, US1, US2, US3 or root-only review/integration phases. This is **PLANNED traceability**, not executed test coverage or passed implementation.

## Detection passes and findings

| ID | Category | Severity / disposition | Evidence | Required action |
| --- | --- | --- | --- | --- |
| A1 | Duplication | **NONE actionable** | FR-009/FR-011/FR-012 intentionally distinguish usage accounting, replay identity and expensive validation concurrency; US1 and US2 are independent | Preserve separate source/test lanes; no duplicate code task |
| B1 | Ambiguity | **HIGH — GATED, not an unacknowledged doc gap** | `spec.md` FR-006, FR-010, FR-013–FR-015; proposed contract | Explicitly approve uncertain-vs-no-speech, HTTP/body/Retry/copy, codec compatibility, decoded duration/padding and short legitimate speech before server source |
| B2 | Ambiguity | **HIGH — GATED** | SQL 087 `voice_ai_reserve_work_at` and `voice_ai_release_work`, `contract` and T018–T020 | Define released-terminal same-key retry, accepted replay concurrent VAD, lease expiry, false/unknown release and started-RPC ambiguity. Never silently edit SQL/#384 |
| C1 | Underspecification | **HIGH — EXTERNAL FEASIBILITY BLOCKER** | Existing research/README, 19 missing corpus assets, no Deno/FFmpeg execution or Edge measurements; T011–T016 | Licensed quiet speech + synthetic/real negatives, pinned Rust/WASM/ONNX load, false negatives, CPU/wall/true peak memory/bundle and Edge headroom |
| C2 | Underspecification | **MEDIUM — ROOT PRECHECK** | `apps/mobile/package.json` declares Expo ~55.0.27 and filesystem ~55.0.23; actual locked subdependency version not executed; T004 | Root verify lockfile-resolved API and meaningful SDK55 throwing-root/working-legacy RED; do not substitute a dummy mock assertion |
| D1 | Constitution alignment | **NO KNOWN VIOLATION in planned artifacts** | `plan.md` Constitution Check, FR-007/016/018/020 and tasks | Preserve auth, type safety, service layering, offline/financial boundaries, original provider, 35-day replay, privacy; any later deviation needs explicit approval |
| E1 | Coverage gaps | **NONE in planned requirements** | Coverage table above + manual M391-01–19 | Do not convert planned traceability into tests passed/device acceptance; keep owner NOT RUN |
| F1 | Inconsistency | **RESOLVED IN DOCUMENTS** | Historical research source 60s vs current #389 FR-045 30s **local**; client 1,500ms guard; `spec.md` FR-013/014 | Preserve current local 30s and avoid unsupported server duration/padding choice; no source edits |
| F2 | Inconsistency | **RESOLVED IN TASK ORDER** | T005–T010 is independent of T011–T027; #391 branch includes current Voice parent; separate startup worker owns route/flow | Root can accept cleanup TDD while speech remains BLOCKED; no cross-branch overlap |
| F3 | Operational gate | **MEDIUM — ROOT ACTION PENDING** | `.specify/extensions.yml` has auto-execute Git hooks, while planning ownership forbids hook/ref mutations; T002–T003 | Root uses existing `SPECIFY_FEATURE`, explicitly disables mutating hooks, runs actual local prerequisites and canonical analyzer; this ChatGPT lane cannot claim those executions |

### Severity summary

**0 critical constitution/coverage contradictions discovered.** There are **3 HIGH outstanding implementation-blocking gates** (B1/B2/C1), **2 MEDIUM root preflight/document-evidence gaps** (C2/F3), and **0 uncovered FR/NFR/SC**. HIGH gates are named and block server implementation; they do **not** block the independent cleanup RED slice because it does not depend on speech policy, a new server result or schema. This report is **not a Speckit CLI PASS certificate** or a binding/model acceptance. Root may identify further findings through its local prerequisite and independent analyzer.

## Architecture and product decisions that remain open (server STOP)

1. **G391-S1 — Runtime + licenses:** already pinned Symphonia AAC/MP4/WASM + Silero/ORT candidate must actually compile/initialize and run in a separately allowed environment; 19 fixtures missing; no authorized Deno/FFmpeg retry, wrappers or hosted calls.
2. **G391-S2 — Quality and policy:** valid quiet Egyptian Arabic/English/code-switch and short/speech-over-noise recall; no model threshold/min speech/duration-padding tolerance approved; unknown classifier outcome contract needed.
3. **G391-S3 — Server and mobile UX:** no new HTTP error/status/copy until product approval; preserve already-defined 400/401/403/413/429/503 and success; avoid unapproved route/flow/availability work assigned to startup.
4. **G391-S4 — SQL/idempotency:** `voice_ai_release_work` true only for still-reserved non-started row, while released-terminal same-key replay refuses; concurrent unexpired key may admit multiple validators. Test with exact RPC semantics before proposing any schema/new decision. #384 is separately deferred.
5. **G391-S5 — Duration:** current 30-second native active-only limit, historic research 60s, server decoded duration/padding unmeasured and current 1.5-second mobile minimum require a separate joined product decision.

## Gate ledger / next actions

| Gate | Actual evidence | Status |
| --- | --- | --- |
| G391-P1 Published research/source ancestry | `a7e1e00e…` merge includes `fe16f48…` + `f625183…`; only nine research/prototype files differ from Voice | READ-ONLY VERIFIED at planning kickoff |
| G391-P2 Six canonical documents drafted | This author staged only the six requested markdown blobs; no production/test/issue/ref change before docs publication | DRAFTS COMPLETE; root review required |
| G391-P3 This structured analysis | Source-informed six detection passes across complete proposed artifacts, traceability counted above | COMPLETE **manual read-only review**; no CLI execution |
| G391-P4 Root local correct-feature prerequisite / canonical analyzer | `SPECIFY_FEATURE=391-voice-empty-audio-guard`, mutating optional hooks disabled | **NOT RUN** by this author; root owns |
| G391-C1 SDK55 cleanup test-only + accepted RED | Genuine SDK55 root-import runtime throw before minimal `/legacy` correction | **NOT RUN**; READY for separately authorized T005–T007 |
| G391-C2 Cleanup source/GREEN | Only recorder + fixture + dedicated test, scope after root RED | **NOT RUN / NOT AUTHORIZED YET** |
| G391-S Speech runtime + replay/response policy | No build/inference/corpus/Edge result or approved thresholds/copy | **BLOCKED** |
| G391-F Owner device + root final integration | Native, QA, Maestro, published PR, deployment and final full batch | **NOT RUN** |

**Decision:** Approve cleanup-only TDD ownership after root accepts exact paths; hold all decoder/VAD server source, SQL, UI copy, route/flow, provider/hosted and migration assignments until the gates above close. No executable, decoder benchmark, sample recording, test or analyzer CLI was invoked by this planning lane.
