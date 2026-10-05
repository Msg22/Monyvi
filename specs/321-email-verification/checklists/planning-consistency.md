# Planning Consistency Review: Complete Email Verification

**Issue**: #321  
**Branch**: `codex/issue321-email-verification`  
**Originally reviewed**: 2026-09-21  
**Reconciled**: 2026-10-05  
**Result**: IN PROGRESS — earlier link-first/no-server-state assumptions were
superseded by explicit later approvals

## Authority and scope

- [x] Supabase Auth remains the only email-verification authority.
- [x] The primary signup UX is six-digit code verification; signup confirmation
      link is a secondary fallback.
- [x] No custom verification-token table or competing auth authority exists.
- [x] A focused resend limiter table, service-role SQL routines, and one Edge
      Function were later explicitly approved. The old statement that #321 would
      add no Edge Function/table is historical and MUST NOT be used as current
      authority.
- [x] No WatermelonDB, financial schema, sync, or financial-action contract
      change is part of #321.
- [x] `monyvi://auth-callback` remains the v1 callback.
- [x] Password recovery/reset correctness is excluded from #322 and tracked by
      #373.
- [x] Resend public account-state/oracle hardening is excluded from #322 and
      tracked by #372. Current behavior MUST NOT be called enumeration-safe.

## Mockup/binding state

- [x] The sole approved revised board is
      `mockups/verification-flow-approved.png`, SHA-256
      `d1a0778e9d0fe00385eeb3c59e27e7428671a96b2eee91e851b3ef7d109e5976`.
- [x] Its adjacent `verification-flow-approved.binding.md` exists as a truthful
      **PENDING** draft.
- [ ] Binding metadata approval is still required.
- [ ] Approved metadata/combined revisions and approval evidence are still
      required.
- [ ] Canonical `scripts/verify-mockup-binding.js` PASS is still required after
      approval.
- [x] The older `verification-en-light.png`, `verification-en-dark.png`, and
      `verification-ar-light.png` pairs are historical link-first evidence only.
- [x] Visual approval of the image does not authorize the PENDING proposed
      geometry/token/unknown-state metadata.

Therefore non-visual TDD work may continue, but board-governed UI production
changes remain gated.

## Current requirements → evidence map

| Requirement                                             | Primary evidence                                            |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Verified email before private access                    | controller/auth service tests + E2E/device                  |
| Code primary, six digits, 10-minute expiry              | local Auth config tests + Mailpit E2E + hosted policy check |
| Auto-submit exactly once / paste / digit normalization  | controller/component tests + device input QA                |
| Active success waits for Continue                       | real authenticated-event controller test + E2E/device       |
| Cold restart after verified signup may proceed normally | fresh authenticated mount test + device restart QA          |
| Returning unverified enters same flow without auto-send | controller tests + E2E                                      |
| 120s / three resends / anchored 24h                     | pgTAP + manual device cooldown/fourth-resend                |
| Reservation/cooldown before expired-window reset        | F3 pgTAP boundary tests                                     |
| Callback late-session safety                            | F1 service/integration tests + independent review           |
| Verification screen accepted by E2E preflight           | F6 preflight test + exact-head E2E                          |
| Secondary signup confirmation link                      | local template test + Mailpit fallback-link E2E             |
| Google OAuth remains functional                         | focused callback/service regression                         |
| Password recovery                                       | OUT OF SCOPE #373                                           |
| Public resend enumeration hardening                     | OUT OF SCOPE #372                                           |
| EN/AR/light/dark/responsive/a11y                        | binding-approved visual/manual evidence only                |
| Hosted delivery/provider health                         | hosted/device/provider manual evidence only                 |

## Architecture consistency

- Auth protocol/session mutation belongs under `apps/mobile/services/`.
- `auth-callback.tsx` is an orchestration route, not a second user/profile state
  machine.
- `useAuthScreenController.ts` owns verification-screen lifecycle.
- The resend limiter is anti-abuse state only; it stores no verification token
  and no raw email.
- Callback/session late-race hardening must coordinate session mutation and
  publication without introducing durable signup-Continue persistence.
- No listener callback may deadlock by calling/awaiting Supabase auth while
  inside the SDK auth listener.
- Exact-head Green evidence is required after late-review changes; historical
  Green runs remain historical.

## Evidence discipline

- Functional automated tests, exact-head CI, E2E, visual fidelity,
  accessibility, hosted Auth/template state, SMTP/provider delivery, and
  physical-device QA are separate statuses.
- A cache-hit Android build job is not fresh-build evidence.
- Hosted configuration is not Green from source code alone.
- A local template change is not proof that the hosted template changed.
- A visually approved board with PENDING binding metadata is not final visual
  implementation authority.
- Final sign-off records the immutable SHA for every automated category and
  explicitly labels manual/external evidence.

## Final decision

**Implementation remains in progress.** Product direction and non-visual scope
are approved. Board-governed UI work waits for binding approval. Final release
readiness also waits for exact-head auth/session Green, E2E, hosted/template,
provider/device, visual, and accessibility evidence.
