# Voice controls R2 — semantic planning analysis

**Method:** canonical `.claude/commands/speckit.analyze.md` detection model applied
read-only to current spec/plan/tasks plus R2 requirements. The repo-generated
`.agents/skills/speckit-analyze/SKILL.md` is absent. Root owns the actual local
prerequisite command and analyzer execution on this package.

## Findings

| ID | Category | Severity | Location(s) | Finding | Reconciliation |
| --- | --- | --- | --- | --- | --- |
| I1 | Inconsistency | HIGH | `useVoiceRecorder.ts:45-46,342-371`; R1 manual plan | Current/R1 local recording cap is 60 s, owner R2 requires 30 s | FR-045/T069/T070 replace only the local cap; historical R1 evidence remains unchanged |
| I2 | Inconsistency | HIGH | `VoiceTransactionEntry.tsx:311-353` | Current Recording uses Stop and Paused swaps Resume ahead of Stop | FR-043/T069/T071 require fixed Submit-left / Pause-or-Resume-center / Discard-right |
| I3 | Inconsistency | HIGH | R1 binding context + current Voice presentation | R1 ordinary states retain static 140/172 filled halos; R2 removes them | FR-044/T069/T071 define explicit narrow precedence; daily/unavailable remain prior authority |
| I4 | Underspecification | MEDIUM | server `parse-voice` boundary | Client 30 s cap is not proof server rejects longer audio | FR-047 and business decision explicitly defer authoritative duration/empty-audio research to #391 |
| I5 | Ambiguity | MEDIUM | owner “faster route/startup” request | No measured baseline or latency target; candidate duplicate permission/availability work exists | Separate latency addendum owns measurement/optimization; R2 forbids gate deletion or false Listening |
| I6 | Approval | HIGH | new R2 sidecar/manifest | Owner approved PNG, but exact sidecar/fingerprint tuple is not approved | T068 blocks production until root computes/verifies exact revisions and accepts the facts |
| I7 | Copy | MEDIUM | R2 Submit label | EN Submit is explicit; no existing standalone Arabic Voice Submit key exists | DRAFT proposes `إرسال`; root must accept exact sidecar before implementation |
| I8 | Traceability | LOW | current recorder comment | Source comment associates 60 s with FR-004, while spec FR-004 is burst-rate limiting | Future implementation should correct touched comment; no retroactive R1 rewrite needed |

## Coverage summary

| Requirement | Task coverage | Status before implementation |
| --- | --- | --- |
| FR-043 fixed control layout/colors/copy | T068–T071,T073–T074 | Covered/planned |
| FR-044 scoped static-halo removal | T068–T071,T073–T074 | Covered/planned |
| FR-045 30 s active-time cap/timer | T069–T070,T072–T074 | Covered/planned |
| FR-046 no auto-submit + lifecycle races | T069–T070,T072–T074 | Covered/planned |
| FR-047 server/latency honesty | T067–T074 + #391/latency lane | Covered with external dependencies |
| SC-019 controls responsive/locale | T069,T071,T074 | Covered/planned |
| SC-020 timer/pause/cap | T069–T070,T074 | Covered/planned |
| SC-021 no provider at cap/race safety | T069–T070,T072–T074 | Covered/planned |
| SC-022 scoped visual/no-regression | T069,T071–T074 | Covered/planned |

## Constitution alignment

No R2 requirement requires a constitution exception. Planned implementation
continues strict TypeScript, NativeWind registered tokens, ≥48 dp interactions,
responsive/RTL/dark variants, consent/auth/user scoping and service/hook
boundaries. Visual completion still requires owner rendered evidence.

## Required next gates

1. Root computes image SHA-256 and official binding/combined revisions, reviews
   the exact sidecar and records approval.
2. Root runs actual local Speckit prerequisite + read-only analyze on the final
   package and resolves any new finding.
3. Meaningful R2 Red before production; no import/setup failure counted as Red.
4. Implementation and independent review.
5. Owner device/native/render/a11y evidence; no remote E2E/device claim.
