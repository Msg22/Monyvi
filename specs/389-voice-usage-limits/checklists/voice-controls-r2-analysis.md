# Voice controls R2 — semantic planning crosscheck (NOT executed Speckit)

**Source:** `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`, owner-approved
green/gray/red composite PNG verified as
`sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`,
1832×858 pixels, 1470108 bytes, Git blob
`caceb8d1cade9e4e9c574e95fc0e603a39e766de`.

**Status:** This is a source-informed **manual** cross-artifact reconciliation
against the canonical analyzer's detection categories. **No
`speckit.analyze` executable/pre-requisite run is claimed.** Root MUST
run correct-feature prerequisites + canonical READ-ONLY
`.claude/commands/speckit.analyze.md` after exact R2 binding acceptance
and **before T069–T071**. Resolve actual analyzer findings separately.

## Findings and disposition

| ID | Category | Severity | Source/evidence | R2 reconciliation |
| --- | --- | --- | --- | --- |
| I1 | Functional mismatch | HIGH | `useVoiceRecorder.ts` current cap 60 s | FR-045, T069/T070: 30 s **active** cap, pause excluded, native stabilization unchanged |
| I2 | UI semantics | HIGH | `VoiceTransactionEntry` uses Stop and paused order moves controls | FR-043, T069/T071: Submit green LEFT, Pause/Resume gray CENTER, Discard red RIGHT across EN/AR |
| I3 | Completed third panel absent | HIGH | R2 image + source lacks explicit capped completion panel | FR-043–046: **Recording complete / التسجيل مكتمل**, `00:30 / 00:30`, enabled LEFT Submit, **disabled gray CENTER Pause**, enabled RIGHT Discard, **no Resume/waves/helper**, retained audio until explicit action |
| I4 | UI precedent | HIGH | R1 ordinary 140/172 filled halos | FR-044, T069/T071: remove only ordinary filled backgrounds in idle/Starting/recording/paused; preserve R1 waves and daily/unavailable disabled artwork |
| I5 | Server boundary | MEDIUM | Local client cap does not establish server enforcement | FR-047/#391: no claim of server duration rejection or empty/speechless handling |
| I6 | Binding compatibility | BLOCKING | Draft sidecar lacked official image field and 15 verifier keys | Corrected `Approved reference image`, real image SHA, 15 required labels; computed draft metadata `sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e`, combined `sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14`; root checks exact values then records delegated revision acceptance |
| I7 | Arabic/localization | RESOLVED | Owner/lead accepts faithful translations | Submit **إرسال** and completed title **التسجيل مكتمل**; no new approval ambiguity; physical order not mirrored |
| I8 | Stale touched source comment | LOW | Current 60 s comment incorrectly references FR-004 (burst) | T070 updates only if touching corresponding duration constant/comment, no R1 history rewrite |
| I9 | Proven duplicate native permission check | HIGH | Route `add-transaction.tsx:288`, flow `useVoiceTransactionFlow.ts:376` | FR-047/T069–T070: **one** fresh just-in-time native check with typed current-actor generation-safe missing/blocked/unknown/granted result, inline recovery and explicit-only OS permission request; no consent/quota bypass |
| I10 | Proven unnecessary initial hidden Manual mount | MEDIUM | Voice-first route still mounts 861-line `ManualTransactionEntry` and hooks | FR-047/T069/T071: defer first Manual mount until selected, **keep mounted thereafter** to preserve draft and Save/transfer/recurring; default Manual route unchanged |
| I11 | Unmeasured availability behavior | CONDITIONAL | Focus and start may abort/restart HTTP availability requests | **No** in-flight/transport change under R2; authoritative preattempt allowance and actor cancellation remain |
| I12 | Wrong gate order | HIGH | Prior T073 placed first canonical read-only analyze after code | T068 requires verified exact binding then correct-feature **read-only analyzer BEFORE T069–T071**; T073 is **independent postimplementation review** |

## Requirement and task coverage

| Requirement / success criterion | Minimal owned test/implementation mapping | Evidence |
| --- | --- | --- |
| FR-043 / SC-019 fixed three-state control identities/colors/AR | T069 Red, T071 UI, T072 checks, T073 review, T074 owner | Planned, NOT RUN |
| FR-044 / SC-022 ordinary halo override, preserve daily/unavailable | T069, T071–T074 | Planned, NOT RUN |
| FR-045 / SC-020 active 30 s and elapsed/max timer | T069, T070–T074 | Planned, NOT RUN |
| FR-046 / SC-021 completed cap retention, manual Submit, race safety | T069, T070–T074 | Planned, NOT RUN |
| FR-047 privacy-safe latency and server honesty | T069 tests, T070 one permission result, T071 lazy first Manual, T072–T074; separate #391 | Planned; no measured speed claims |
| Exact binding + actual **preimplementation analyzer** | T068, before T069 | PENDING root verifier/analyzer |
| Independent postimplementation logic/style/review | T073 following T070/T071/T072 | PENDING |
| Native/OS permission, rendered, accessibility trees | T074 owner | NOT RUN |

## Constitution and approval boundaries

No constitution exception or new commercial/server policy is proposed.
Existing TypeScript, NativeWind, authenticated actor, AI processing consent,
preattempt server quota, provider/replay identity, 35-day retention, native
300 ms early-command stabilization, Manual draft, responsive/RTL/dark,
reduced-motion and separate rendered/a11y proof stay mandatory.

**Owner approval covers the R2 image/concept.** The root's faithful design
review accepts specified facts/Arabic wording, but local verification of
the corrected exact 15-key Binding Facts and combined SHA **precedes**
truthful delegated *revision* acceptance. This draft has not passed its
binding verifier (no run here); do not change status to APPROVED or invent an
owner fingerprint/timestamp.

## Execution boundary

No Jest, TypeScript, lint, Maestro, Speckit prerequisite/analyze, native audio,
OS permission, provider, deployment, image generation, UI screenshot,
accessibility tree or device timer measurement ran in this planning leaf.
Latency hypotheses require owner measurements; no promised 1–2 s target.
