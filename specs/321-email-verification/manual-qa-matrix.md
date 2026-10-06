# Issue #321 Verification Evidence and Manual QA Matrix

**Purpose**: Keep automated, E2E, visual, accessibility, hosted, provider, and
physical-device evidence separate. A PASS in one column never implies PASS in
another.

**Current scope exclusions**:

- password recovery/reset correction: #373;
- resend public account-state/oracle hardening: #372.

## Functional journey matrix

| Scenario                                | Expected contract                                                                | Automated/local target                      | Manual / external target   |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------- |
| Fresh signup                            | Opens code-entry state; original send registered                                 | controller/service tests; local Mailpit E2E | Android/iOS signup smoke   |
| Returning unverified sign-in            | Enters same code screen; **no automatic resend**                                 | controller + E2E                            | device sign-out/sign-in    |
| Six-digit entry                         | Accept six numeric digits and auto-submit exactly once                           | controller/component                        | physical keyboard/device   |
| Paste                                   | Paste six digits; submit exactly once                                            | component/controller                        | OS clipboard               |
| Arabic-Indic / Eastern Arabic digits    | Accept/normalize input; pictured display remains Western `1 2 3 4 5 6`           | normalization tests where implemented       | Arabic keyboard device QA  |
| Duplicate submit                        | Pending request prevents second submit                                           | controller                                  | rapid input/tap sanity     |
| Wrong code                              | Product-safe error; input recoverable                                            | service/controller                          | device retry               |
| Expired code                            | Product-safe expired error; retry/resend available                               | service/controller                          | local/hosted expiry sanity |
| Known send timestamp                    | Show authoritative countdown from known send                                     | controller                                  | device timer               |
| Unknown send timestamp                  | Do not invent countdown; show generic ten-minute rule                            | controller                                  | returning/cross-device QA  |
| Active verification success             | Auth event cannot bypass Email verified; Continue required                       | real authenticated-event test               | device success flow        |
| Full cold restart after verified signup | Persisted verified session may use normal startup                                | fresh authenticated mount test              | kill/reopen app            |
| Primary local email journey             | Mailpit -> six-digit code -> OTP -> success -> Continue                          | `e2e:email-verification:local`              | not production SMTP        |
| Secondary local fallback link           | Mailpit -> secondary confirmation link -> signup callback -> success -> Continue | deterministic local callback E2E            | Android callback cold/warm |
| Invalid/noncanonical callback           | Fail closed; no token/callback secret leakage                                    | service/route tests                         | malformed-link sanity      |
| Google OAuth                            | Existing destination/behavior remains functional                                 | regression tests                            | hosted/device OAuth        |
| Password recovery                       | **OUT OF SCOPE #373**                                                            | do not use as #322 Green                    | separate issue QA          |

## Resend limiter matrix

| Scenario                         | Expected contract                                             | Deterministic evidence                                                                                               | Manual / hosted evidence                        |
| -------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Original send registration       | Anchors 24h window                                            | pgTAP/Edge tests                                                                                                     | hosted signup                                   |
| <120s resend                     | Cooldown                                                      | pgTAP                                                                                                                | real 2-minute device QA                         |
| First/second/third resend        | Accepted when otherwise eligible                              | pgTAP/Edge tests                                                                                                     | representative device resend                    |
| Fourth resend                    | Denied until anchored window resets                           | pgTAP                                                                                                                | fourth-resend device QA                         |
| Live reservation at 24h boundary | `busy`; reservation preserved before rollover                 | F3 pgTAP                                                                                                             | no 24h manual wait                              |
| Stale reservation at boundary    | Fail closed exactly once, clear reservation, cooldown applies | F3 pgTAP                                                                                                             | no 24h manual wait                              |
| Active cooldown + expired window | Cooldown wins before rollover                                 | F3 pgTAP                                                                                                             | no 24h manual wait                              |
| Provider/send failure            | Reservation released; no unfair slot consumption              | Edge/pgTAP                                                                                                           | provider failure drill if available             |
| Concurrent requests              | Cannot exceed policy                                          | sequential reservation/busy pgTAP plus advisory-lock source contract; true parallel DB contention remains unexecuted | not a manual timing proof                       |
| Public account-state privacy     | Known limitation                                              | #372 only                                                                                                            | must remain disclosed; **not enumeration-safe** |

## Callback/session race matrix

| Scenario                                             | Required result                                                                   | Evidence target                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| Callback A pending, email B starts                   | B waits until A settles/compensates                                               | service/public-entrypoint integration     |
| Callback A pending, OTP B starts                     | B waits until A settles/compensates                                               | service/public-entrypoint integration     |
| A saves/notifies after UI timeout                    | A never becomes stable/private auth; compensation before B                        | route/AuthContext integration             |
| Preexisting legitimate P lost by A failure           | P reconciled safely when still valid                                              | integration                               |
| Restore readback still A                             | Current process quarantines further auth writes                                   | integration                               |
| Failure leaves P untouched                           | No blanket quarantine; B remains allowed                                          | integration                               |
| Explicit logout while A pending                      | Logout intent wins; no P restoration; SDK logout ordered safely                   | integration                               |
| Raw provisional SIGNED_IN/TOKEN_REFRESHED A          | AuthContext does not publish A                                                    | AuthContext integration                   |
| Listener callback                                    | Does not call/await Supabase auth methods                                         | AuthContext integration                   |
| Auto-refresh during callback mutation                | Bounded stop/start containment; rotated A not promoted                            | integration                               |
| StrictMode/generic unmount                           | Observer detaches only; no transaction cancel/logout                              | route integration                         |
| Same PKCE callback while pending                     | One exchange only                                                                 | auth-service                              |
| Same PKCE callback after terminal success/error      | Never re-exchange consumed code                                                   | auth-service                              |
| Cached PKCE terminal result after logout/new session | Must not assert stale session authenticated; generation/session validity required | late-review regression before final Green |
| Warm callback cached before route mount              | Use Expo native latest-URL cache even when RN initial URL is null/stale            | actual Expo JS hook integration test      |
| Fresh params object during processing                | Must not dispose the sole observer for the same callback URL                       | route lifecycle regression                |
| Callback A replaced by newer URL B                   | Cleanup A observer; B completes; late A result cannot overwrite B                  | route lifecycle regression                |
| Native callback delivered after mount                | Active Expo URL subscription processes the new URL                                 | actual Expo JS hook integration test      |
| Callback route unmount with pending completion       | Listener removed and late result ignored                                           | route lifecycle regression                |

## Visual / responsive / accessibility matrix

The six-panel board and its binding metadata are **APPROVED** as the
authoritative combined tuple at revision
`sha256:6b8db88a6cec5cf73ef35e6c95ace82405da52e293b04300cfc538774ba9b6d6`; the
canonical repository verifier has passed. The approved binding is now
implemented in the verification code/success presentation source and shells.
Focused exact-head RNTL/TypeScript/lint verification is still pending, and this
does **not** establish rendered visual/device fidelity. Mohamed owns that manual
evidence.

Verify manually without stretching the reference board:

| Variant                     | Evidence                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Standard phone baseline     | calibrated comparison at approved viewport                                                  |
| Compact phone               | no clipping; six cells/touch targets remain usable                                          |
| Tablet                      | centered content, approved max-width behavior                                               |
| Portrait / landscape        | safe-area + scroll behavior                                                                 |
| Font scale 1.0 / 1.35 / 2.0 | adaptation at 1.35, readable/no clipped actions at 2.0                                      |
| Keyboard visible            | OTP/actions remain reachable                                                                |
| EN light                    | code + success where pictured                                                               |
| EN dark                     | code as pictured; unpictured success uses compatibility evidence unless separately approved |
| AR light                    | code + success where pictured                                                               |
| AR dark                     | code as pictured                                                                            |
| Invalid code / cooldown     | error stays visibly red; disabled Resend is filled, 52pt high, radius-14                    |
| RTL header/back/email       | mirrored header; email LTR; pictured back direction                                         |
| Screen reader               | one logical OTP input, clear labels/state, focus order                                      |
| Legal/footer                | preserve current #327 exception/status                                                      |

Unpictured focus/error/expired/active-resend/in-flight states are validated for
functional/theme/accessibility compatibility separately from pixel fidelity.

## Hosted / delivery / device evidence

These are **manual/external** release checks, not CI. No emulator/device/visual
runtime is executed on this PR. Android E2E is intentionally deferred to the
existing main-only `.github/workflows/ci.yml` guard; Mohamed owns device/visual
verification.

**2026-10-06 read-only hosted status:** the live hosted project is currently
misaligned with the approved contract: OTP length **8**, expiry **3600
seconds**, minimum send frequency **60 seconds**, and the installed confirmation
template still contains the older one-hour copy with a gradient-only green
header and no secondary `ConfirmationURL` fallback. SMTP currently reports Brevo
(`smtp-relay.brevo.com`) with a Gmail From address. These findings are
diagnostic only; no hosted Auth, template, SMTP, DNS, sender, or provider
mutation is authorized by this PR wave.

Release alignment still requires:

- hosted confirm-email enabled;
- hosted OTP length = 6;
- hosted OTP expiry = 600 seconds;
- hosted minimum send frequency = 120 seconds;
- tracked limiter migration/function actually deployed before hosted resend QA;
- hosted Confirm Signup template matches current local code-first +
  secondary-link template and says 10 minutes (hosted parity remains unproven);
- Gmail delivery (pending);
- Outlook/Hotmail delivery (pending);
- one additional mailbox provider (pending);
- spam-folder observation where applicable;
- SMTP/provider delivery, bounce, suppression, SPF/DKIM/DMARC health;
- Android physical/emulator end-to-end journey;
- Android signup-link callback cold + warm/background delivery on a real device;
- email-client link launch behavior (including app already open/backgrounded);
- iOS physical/build journey when available;
- real 2-minute cooldown;
- fourth-resend denial;
- native OTP/autofill behavior;
- clipboard paste;
- Android signup-link callback cold + warm start;
- visual evidence against the approved binding (pending, Mohamed-owned);
- screen-reader/accessibility device evidence (pending, Mohamed-owned).

## Final immutable evidence record

At final PR readiness, record each category separately against the exact final
commit SHA:

| Category                       | Final SHA / evidence | Status  |
| ------------------------------ | -------------------- | ------- |
| TypeScript                     | PENDING              | PENDING |
| Lint                           | PENDING              | PENDING |
| i18n/repository checks         | PENDING              | PENDING |
| Mobile Jest/auth focused tests | PENDING              | PENDING |
| Edge resend contract           | PENDING              | PENDING |
| pgTAP                          | PENDING              | PENDING |
| #321 E2E                       | PENDING              | PENDING |
| Visual binding verifier        | PENDING              | PENDING |
| Visual fidelity                | PENDING              | PENDING |
| Accessibility                  | PENDING              | PENDING |
| Hosted Auth/template           | PENDING              | PENDING |
| SMTP/provider delivery         | PENDING              | PENDING |
| Android device                 | PENDING              | PENDING |
| iOS device                     | PENDING              | PENDING |

Historical Green runs remain historical evidence only and MUST NOT be copied
into this table as final exact-head proof.
