# Planning reconciliation and approval package

Reviewed locally on 2026-10-07. No implementation or worker assignments. The
original T001–T059 checklist is preserved and refined in place.

## Source and authorization

- Worktree: `E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`.
- Published handoff: `dcf1671daa4b2ab14bc2b8846911d411e6c08a0d`.
- Governing main: `2095ec061d531854603e8415122231f1cbf4c1a0`.
- Main merged and published to `389-voice-usage-limits` at
  `d97146960593117e61797e65bca852cec6bc7fbf`.
- Current owner request authorizes local planning reconciliation without
  delegation before implementation, overriding the generic lead-only-edit
  restriction for these planning artifacts. No product code or tests authored.
- Source chat `Branch · Branch · Compare AI Providers Value`,
  `6ac61c86-60d8-83ea-b794-143b4aea9d5d`, confirms the preserved 59-task draft,
  pending bindings/contracts, stopped cloud work, and execution-pool order.
- Branch sync was separately requested. Further planning commits/pushes and
  implementation are not implied by the sync operation.

## Contract reconciliation

| Conflict                          | Disposition                                                                                                                                                                 | Evidence / canonical owner                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET versus POST                   | POST JSON `{timeZone}`; OPTIONS CORS; no GET alias                                                                                                                          | Existing approved expanded plan and endpoint-specific availability contract                       |
| Timezone 100 versus 128           | 1–128 characters, followed by server IANA validation                                                                                                                        | Both expanded endpoint contracts; timezone changes never reset an active window                   |
| Required versus optional date     | Optional `callerLocalDate`; omitted/empty preserves UTC-date fallback; non-empty invalid calendar date refused                                                              | Existing `parse-voice/index.ts`; FR-001/FR-024 preserve parsing; quota timezone remains mandatory |
| Consent omission                  | Auth plus active AI consent before availability/accounting; 403 without provider start                                                                                      | Existing business decision, FR-011, legacy API contract                                           |
| Nullable/unmetered availability   | Preserve technical future shape; current free-launch resolver emits numeric allowance/count and reset timestamp; null triplet only in controlled future-entitlement doubles | Existing data model and FR-020–FR-023; no unlimited launch config, tier or paywall                |
| Missing policyVersion             | Required non-empty policy version across public snapshot and runtime policy                                                                                                 | Expanded plan and endpoint-specific API                                                           |
| Replay mixed into snapshot reason | Snapshot reason is current daily/burst blocker or null; replay is enclosing parse refusal                                                                                   | Snapshot answers current availability; parse refusal identifies request-specific replay           |
| Duplicate APIs                    | `voice-ai.openapi.yaml` becomes reference-only compatibility index                                                                                                          | Endpoint files own paths/shapes; no repeated contradictory schema                                 |
| Layout-owned refresh              | Unified Add Transaction route focus, foreground, every attempt/refusal and server boundary                                                                                  | Expanded plan, R-018; R-009 corrected                                                             |
| Migration collision               | Next candidate `082_voice_ai_usage_limits.sql`, recheck immediately before writing                                                                                          | Current main already contains 077–081; no migration written                                       |
| 35-day cleanup versus replay      | APPROVED 35-day horizon and safe terminal identity deletion; see below                                                                                                      | FR-010/SC-004 now explicitly bound replay protection; business decisions updated                  |

No source provider/model, successful financial response, date semantics,
transaction schema, SMS policy or financial sync behavior changes here.

## Replay retention choice — APPROVED

Owner selected on 2026-10-07 in chat 01a11606-3a5e-7420-a9d7-0ea491bde802:
"let's delete the id after 35 days, that's fine."

The selected policy protects same-key replay for 35 elapsed days (35 × 24 hours)
from immutable first server record `created_at`. Retries/status updates do not
extend that cutoff. At/after it, bounded cleanup deletes eligible whole terminal
work-request records, including identity. No account-lifetime tombstone,
details- only compaction or third table is introduced.

Cleanup serializes with admission/start under the same per-user lock, rechecks
eligibility and preserves all active work/leases/current daily/burst/reservation
accounting. It never deletes active usage windows or refunds current consumed
units. A retained expired record still protects replay until actual deletion.
After eligible deletion, the same key may be admitted as new only under current
auth/consent/validation/entitlement/quota gates.

Spec FR-010/FR-013/SC-004, plan, data model, R-004/R-012, parse request
contract, quickstart, existing task tests and business decisions now carry this
rule. SQL cutoff/concurrency/cleanup and HTTP readmission tests are planned, not
executed. Lifetime identity retention was considered and not selected.

## Binding reconstruction — APPROVED

Original images remain unchanged. Original viewport/font/token facts cannot be
recovered as authoritative from a framed raster. The owner approved the two
sidecars' normalized implementation context on 2026-10-07:

- 390 x 844 logical dp baseline, Arabic/light/font scale 1; fixture safe-area
  insets 24 top/34 bottom; runtime uses actual insets once.
- Existing standalone stack/back route. The pictured bottom tab bar is
  illustrative; no new Add tab or global-navigation redesign.
- Preserve card hierarchy, green microphone/halo, allowance progress, examples,
  mode tabs and compact Manual allowance strip.
- Exact spacing, sizing, palette/font tokens, interaction/state mapping,
  responsive/dark/RTL/enlarged-text adaptations are in the two sidecars.
- Existing Manual form semantics win over illustrative merchant/type fields.
  Required markers and bottom-safe-area treatment follow current shared rules.
- Local-midnight reset wording replaces the superseded raster wording.

Owner reply: "Approve both proposed bindings and copy" in chat
01a11606-3a5e-7420-a9d7-0ea491bde802, call_3SOfr0FPm3RmUNgWIRuA5lS8 item 0.
Exact approved combined revisions:

- Voice: sha256:67c0ffba93b576edb8d3e3cb1545489aa9930f084de953f68b5fef0ca4e0a2cc
- Manual:
  sha256:0b06db4128417a2981ef0e943953e2186967decab2495ca83aed8c6c229943a8

Both verifiers exited zero after recording approval. Image and Binding Facts
bytes are unchanged; proposal wording inside the frozen facts is now adopted by
this approval. The normalized context is not original historical evidence. Any
change to binding facts requires recomputed revisions and renewed approval.
Rendered visual and accessibility evidence remain separate subsequent gates.

## Approved EN/AR copy

| State / role        | English                                                                         | Arabic                                                                                |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Modes               | Manual / Voice                                                                  | يدوي / صوتي                                                                           |
| Limited-use heading | Free voice use is limited                                                       | الاستخدام الصوتي المجاني محدود                                                        |
| Remaining           | {remaining} of {limit} voice uses left today                                    | متبقي {remaining} من {limit} مرات استخدام صوتي اليوم                                  |
| Reset               | Your voice limit resets tomorrow.                                               | يتجدد حد الاستخدام الصوتي غدًا.                                                       |
| Idle microphone     | Tap and speak to add a transaction                                              | اضغط وتحدث لإضافة معاملة                                                              |
| Voice description   | Tell us your transaction. Review the details before saving.                     | احكي لنا عن معاملتك، وراجع التفاصيل قبل الحفظ.                                        |
| Examples heading    | Things you can say                                                              | أمثلة على ما يمكنك قوله                                                               |
| Daily exhausted     | You've used today's voice limit. You can still add a transaction manually.      | وصلت لحد الاستخدام الصوتي اليوم. تقدر تضيف معاملة يدويًا.                             |
| Burst limited       | Please wait a moment before using voice again.                                  | انتظر قليلًا قبل استخدام الصوت مرة أخرى.                                              |
| Unavailable         | We couldn't check your voice uses. Try again, or add your transaction manually. | لم نتمكن من معرفة مرات الاستخدام الصوتي المتاحة. حاول مرة أخرى أو أضف معاملتك يدويًا. |
| Processing          | Checking your recording…                                                        | جارٍ مراجعة تسجيلك…                                                                   |
| Paused              | Recording paused                                                                | التسجيل متوقف مؤقتًا                                                                  |
| Replay              | This recording was already sent. Record again to try another transaction.       | تم إرسال هذا التسجيل بالفعل. سجّل مرة أخرى لإضافة معاملة أخرى.                        |
| Actions             | Try again / Use Manual / Stop / Pause / Resume / Discard                        | حاول مرة أخرى / إضافة يدويًا / إيقاف / إيقاف مؤقت / متابعة / تجاهل                    |

Current recording timer, permission/consent dialogs, review copy and Manual
field labels remain their current localized contracts. The copy above adds no
merchant promise, paid-plan name, timezone jargon or rolling-24-hour reset.

## Runtime evidence boundary

Planning checks validate artifacts only. No behavioral Red/Green, emulator
journey, screenshot fidelity, accessibility, real provider or hosted deployment
completion is claimed. T004/T005 remain prerequisites for implementation; voice
provider-double/audio/server-clock controls require explicit verified harness
evidence. Existing SMS fixture mode does not prove Voice E2E capability.

Optional before/after `speckit.analyze` commit hooks are not executed. Git Bash
at `C:/Program Files/Git/bin/bash.exe` is the validated prerequisite runner; the
generic Windows `bash` resolves WSL and selected the wrong feature despite the
supplied environment. Use Git Bash with both explicit feature overrides.

Execution pool capability checks and actual role/owner mapping wait until the
implementation phase. Order: user-created Normal ChatGPT chats, suitable
OpenCode, Antigravity, then justified native fallback for the specific task.
