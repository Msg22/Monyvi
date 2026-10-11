# Approved Voice motion overlay — scoped binding context

**Feature:** #347 / `389-voice-usage-limits`
**Status:** Owner-approved concept and interactions; **derived implementation handoff**, not a new image approval or competing binding
**Source revision:** `2026-10-10-voice-motion-r1`, `drafts/2026-10-10-voice-motion-r1/`
**Approved source:** `proposal-approved.txt` (`proposalSha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0`); original five-image `manifest.json` (`approvedManifestSha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799`)
**Approval receipt:** sibling `approval.json` records `status: approved-concepts-and-interactions`, owner approval “mockups approved” and “Approve the proposal”, thread `01a11606-3a5e-7420-a9d7-0ea491bde802`, question `call_WNqHZ69cvzQQG09hJY0sXedd:0`, 2026-10-10T14:39:19.262Z.
**Earlier visual authority:** the *unchanged* five entries in `repair-binding-manifest.json`, approved manifest `sha256:4b06ef2ad901a13cceb06790e49149fb9b314e99c213080e941cce22859b34b8`. The five original sidecars and source images are frozen; no image, Binding Facts, manifest, or approval tuple is changed here.

## Priority and safe interpretation

1. Monyvi constitution, approved business policy, existing financial/Voice security invariants and immutable source approval remain authoritative. The approved motion proposal supersedes **only** the explicitly listed idle appearance, dismissal preference, Starting, recording motion, parsing, inline native-permission explanation, and retry transitions. All other EN/AR idle/daily-limit/Manual B binding facts remain.
2. Existing 390 × 844 **logical-dp normalized** reference, 16 dp horizontal gutters, 12 dp section gaps, 16 dp card padding, unboxed microphone area ≥260 dp, 104 dp mic and 140/172 dp static halos, 48 dp shared interactive minimum, Inter/Noto Sans Arabic, native safe-area exactly once, and centered 560 dp tablet maximum remain binding. The new exports are 853 × 1844 **image pixels**, not a new logical viewport/density/spacing source. Illustration-only phone chrome, bottom bar, typography anomalies, texture, or arbitrary shadows are not UI instructions.
3. New examples-dismiss proposal specifies **at least 44 dp**. The pre-existing shared accessibility/interactivity minimum is **48 dp**; use a ≥48 dp touch target without changing the card hierarchy. This satisfies both requirements, not a product change. Keep focus, accessibility labels and hints localized.
4. The motion timings are approved proposal targets (two strokes ~1.4 s, second +0.7 s, activity bars ~1.2 s, parsing ~1.6 s); they are **not evidence of measured pixels** or an audio-amplitude contract. Use cancelable Reanimated loops and static reduced-motion equivalents. Do not infer other easing curves, exact stroke width, bar heights or waveform path coordinates from 853 × 1844 framing.
5. This document is a **crosswalk**, not an extra gate requiring new approval fingerprints. The owner's concept approval is recorded above; the canonical existing binding verifier, Speckit read-only analysis, TDD and visual/accessibility owner evidence gates still apply. A material invented design or truly unbound fidelity change returns to owner approval, not automatic “derived-map approval”.

## Exact source inventory (immutable)

| Approved proposal image | Source SHA-256 | Scoped role |
| --- | --- | --- |
| `idle-en.png` | `3589cd5e76aa060fc88dbc91982d04de2678b0475ff5603a8af3b49285a3fa10` | Idle embellishments and dismiss control only |
| `starting-en.png` | `513857c54c32e69cdedbc8767663f7f97d87aa59b82115d07ce236d6522592ec` | Immediate pending feedback and Cancel |
| `recording-en.png` | `cd668d390af5f6b8f1227dc753217fd9a46c1f1abaa7c8d8e6d0efe828e77d28` | Ripples, activity, real timer, controls |
| `parsing-en.png` | `9c69656bbd95103beab3b660f972204de42604940d7fba94c769b70d0c58587d` | Non-quantified processing feedback |
| `permission-en.png` | `694975a39066e9a9856824c1e87703c872eee815dd4c4d803bbea0c6d5e066e9` | Native-permission explanation in Voice surface |

The new images show EN proposal examples, **not** independent Arabic/dark/compact pixels. Derive AR and dark only from the existing registered styles, owner-approved copy, old Arabic-specific compositions and explicit new scoped rules. Do not synthesize extra mockups.

## State → component → interaction map

| State/surface | Binding / component owner | Approved display and actions | Accessibility / lifecycle invariant |
| --- | --- | --- | --- |
| Idle EN/AR | Existing `transaction-voice-en/ar.binding.md`; `VoiceTransactionEntry`, `voice-ui/AllowanceCard`, `ExamplesCard` | Preserve respective continuous/segmented authoritative allowance, unboxed mic, examples. **Dark** allowance mic badge changes to `slate-700` with green `mic-outline`, matching dark examples heading badge. **Light** allowance badge unchanged. EN example glyphs remain food/car/coffee in orange/blue/gold; AR quote-only rows stay icon-free. Scoped daily reset text below | No guessed allowance; Examples dismiss target ≥48 dp, localized name; card disappears immediately on dismiss and remains hidden for this user on this device |
| Starting | `VoiceTransactionEntry` state + route pending generation/ref + `useVoiceTransactionFlow` | Immediately on mic tap **before** awaiting fresh consent/availability/native preparation: “Starting…” / “نجهّز التسجيل…”, “Getting ready to listen…” / “لحظة ونكون جاهزين لسماعك…”, **Cancel / إلغاء**. No Listening or ticking timer until real native `record()` succeeded | Guard duplicate taps and async race. Cancel invalidates pending generation and native preparation; late resolution must not reopen recording/permission/consent UI, start a provider or consume a unit. Do not display false zero/quota claims |
| Recording | Existing unboxed 104 dp mic + 140/172 dp static halos; `VoiceActionSurface`, `useVoiceRecorder` | **Two thin strokes** expand from mic boundary to outer 172 dp region, ~1.4 s cycle staggered 700 ms. Gently animated activity bars ~1.2 s. **Actual** timer starts when capture starts. Existing Stop/Pause/Discard actions remain | Effects are decorative, not volume metering. Screen reader receives recording/time/actions, not infinite ripple announcements. Reduced-motion = static. Lifecycle cleanup cancels animation/recording on discard, unmount, account change |
| Paused / resumed | Existing `paused` state, `VoiceActionSurface`, recorder | Paused halts ripples/bars and freezes elapsed time; Resume restores active indicator/timer from actual recorder state. Stop/Discard keep old meaning | Mode locks and permission/replay safety remain; Cancel never leaves a live recorder |
| Finalizing / completed | Existing flow status and cleanup | Preserve existing completion/stop feedback until actual parsing. **Do not** assert “Turning your words…” while only waiting for native stop/preparation | No false parsing stage, no invented progress or extra provider request |
| Parsing / analyzing | Existing `processing` display from `analyzing`; `VoiceTransactionEntry` + scoped `voice-ui` illustration | Replace processing **skeleton** only while parsing with waveform/dots flowing **toward a receipt** on ~1.6 s repeating loop. Title “Turning your words into a transaction” / “نحوّل كلامك إلى معاملة”; body “Getting the details ready…” / “نجهّز التفاصيل…” | No percentage, stage completion claim, invented transaction/details or duplicate requests. Reduced-motion static illustration. True quota/availability **loading** skeleton remains distinct |
| Native permission missing | `VoiceTransactionEntry` inline permission explanation; `useVoiceRecorder` fresh permission check; route `PermissionRecoveryModal` replacement only for this case | When native grant genuinely missing, show **inline** “Allow your microphone” / “اسمح باستخدام الميكروفون”, description and “Allow microphone” / “السماح بالميكروفون” before OS request. Granted users skip explanation. Blocked users have inline Settings/Manual recovery | Do not treat initial asynchronous `hasPermission=false` as denial; distinguish unknown/checking/denied; refresh after Settings/app resume. The Monyvi custom **inline** explanation satisfies the pre-OS rationale. Keep separate first-use AI Processing Consent Sheet |
| Failure / direct retry | Route `handleTryAgain`, flow `retryRecording`, `useVoiceRecorder.start` | Recorder start/preparation failure shows actionable error, never lingering Listening. Recording-error Try again moves **directly to Starting** without visible idle flash, retaining ordinary safe cancellation and new-recording identity rules | Repeat taps/cancel/late failure cannot leak stale capture or release account isolation |
| Retained-audio submission retry | `useVoiceTransactionFlow.retrySubmission` | Resend retained bytes with **the same logical request key**; no new microphone capture, no second allowance, no false Starting-as-new-recording | Keep all 35-day replay retention, auth/consent, quota/lease and user scoping as implemented; #384 separately deferred |
| Availability-check failure Try again | Existing Voice-only unavailable state, `useVoiceAiAvailability.refresh`, route | Refresh authoritative allowance and **automatically continue into Starting if eligible**, without second tap. If still unavailable, exhausted or burst-limited, show its real recovery state; do not bypass guard | User may use Manual; no Voice errors in Manual; no optimistic provider admission |
| True exhausted / burst / unknown / loading | Existing four active sidecars and prior UI contract | Keep existing EN horizontal/AR centered daily-limit alerts, distinct actions, slate disabled mic, 24h local-calendar policy, burst/unavailable states; first-use quota loading still Skeleton | Cannot display fake available/count; no unauthorized quota reservation, provider, hosted or sync change |

## Shared visual tokens and verified identities

| Role | Existing binding/token + proposal delta |
| --- | --- |
| Shared shell/tabs/header | Existing `PageHeader`, 48 dp underline tabs with 2 dp NileGreen selection, standalone route; EN manual-left/voice-right; AR voice-left/manual-right; **no** new bottom tab |
| Mic | Existing `mic`, NileGreen-500/-600 gradient, 104 dp native clipped circular hit target, static 140/172 dp halos; new thin ripples **within the same outer 172 dp region** |
| Allowance/explanation badges | Existing `mic-outline` 24 dp in 48 dp badge; dark bg `slate-700` and green glyph. Examples `bulb-outline` 20 dp, same dark badge treatment. Light existing colors |
| English examples | Existing `restaurant-outline` icon 20 dp in registered orange (`orange-500`), `car-outline` in blue (`blue-500`), `cafe-outline` in gold (`gold-500`); original text and order unchanged. Arabic rows stay quoted and glyph-free |
| Dismiss | Localized accessible name “Dismiss examples” / “إخفاء الأمثلة”; small close affordance built using an existing verified installed Ionicons close glyph, control touch area ≥48 dp; exact source glyph spelling is an implementation-library check, **not** a new product choice |
| Starting / permission | Existing microphone icon family and action controls; use approved copy. Do not invent unrelated modal chrome, new permission API, or an elapsed counter |
| Recording | Existing `mic`, `stop`, `pause`, `play`, resumed recording controls. Animated strokes/bars are **decorative primitives** with theme tokens and Reanimated; not speaker volume visualization |
| Parsing | **Conceptual** waveform/dots → receipt illustration from `parsing-en.png`; use existing native icon/glyph assets only after confirming installed identity; exact stroke/path/easing is **not** approved numeric metadata. No new icon package or fake financial receipt values |
| Exhaustion/other states | Existing `ban-outline`, `calendar-outline`, `cloud-offline-outline`, `timer-outline`, `refresh-outline`, `settings-outline`, `alert-circle-outline`; old locale-specific placement/actions preserved |

## Durable dismissal contract (device-local, authenticated account-scoped)

- Hide **entire** examples card on dismiss, immediately; it stays hidden across route changes, cold restart, language/theme changes, and sign-out/sign-in for the **same authenticated account on this device**. Another account retains its independent choice. No hosted table, Watermelon sync, network mutation or new subscription behavior.
- On sign-in or account switch, scope read/write to the **current authenticated user ID** using an account-namespaced preference key. Never store one global `intro-seen` key: `intro-flag-service` explicitly owns device-wide **pre-auth** flags and is **not** reusable for this account-specific preference. Clear prior user's in-memory value before resolving the new one; do not momentarily show the former user's dismiss choice.
- Missing/unreadable preference defaults to **examples visible**, never borrowing another account's state. A write failure cannot truthfully establish durable dismissal; keep UI responsive, record the error and make later reappearance after restart possible. Do not invent a hosted fallback, global setting, or user-message policy.
- Authenticated only: no persisted anonymous dismissal. Repeat dismiss is idempotent; a slow old read must never reveal/erase a newer dismissed state or leak across account changes.

## Exact localized strings in this approved overlay

| Role | EN | AR |
| --- | --- | --- |
| Daily reset (daily context only) | Your limits reset tomorrow. | يتجدد حد استخدامك غدًا. |
| Starting title | Starting… | نجهّز التسجيل… |
| Starting body | Getting ready to listen… | لحظة ونكون جاهزين لسماعك… |
| Starting cancel | Cancel | إلغاء |
| Parsing title | Turning your words into a transaction | نحوّل كلامك إلى معاملة |
| Parsing body | Getting the details ready… | نجهّز التفاصيل… |
| Permission title | Allow your microphone | اسمح باستخدام الميكروفون |
| Permission body | Monyvi needs access to your microphone to record your transaction. | يحتاج Monyvi إلى الميكروفون لتسجيل معاملتك. |
| Permission action | Allow microphone | السماح بالميكروفون |
| Dismiss examples a11y | Dismiss examples | إخفاء الأمثلة |

The new daily-reset sentence supersedes older daily-copy wording **only** for its explicit role and continues to mean **next local midnight**, not burst expiration or a rolling 24 h window. Other existing texts retain their approved EN/AR bindings.

## Known limits and validation owner

- The source proposal and image-manifest checksums are recorded; **new raster bytes/visual measurements were not independently inspectable in this remote lane** (GitHub connector surfaced empty base64 for these large PNGs). The owner owns originals and the before/after native captures. No invented image inspection, recovered density, pixel-perfect claim, or independently confirmed receipt-icon glyph is made.
- Cross-locale light/dark permission, motion and parsing views are derived from existing registered design tokens, **not separate owner-approved raster exports**. Animate strokes/bars according to the target timings above; if implementation uncovers an actual choice affecting hierarchy/meaning that these facts cannot settle, return that specific choice to owner rather than substitute.
- Real permission check timing, recorder readiness, cancellation races, local preference errors, background/restart and stored replay behavior must be covered by deterministic unit/integration tests; a native/audio/server-clock journey remains owner-only unless a controllable fixture is verified.
- No E2E/device/render/accessibility test was run by this planning author. T034/T035/T049/T050 and visual/a11y T058 remain NOT RUN. Owner must compare baseline 390×844 plus compact 320×640, tablet 768×1024, landscape 844×390, EN/AR, light/dark, font-scale 1.35/2 and separate accessibility trees. Never equate screenshot evidence with screen-reader proof.
- Source read limitations: named `components/ui/PermissionRecoveryModal.tsx` and `hooks/useVoiceAvailability.ts` do not exist; the route actually imports `components/permissions/PermissionRecoveryModal.tsx` and `hooks/useVoiceAiAvailability.ts`. These implementation reads need explicit boundary expansion; they are **not** needed to approve this derived map.

**Next gate (not executed here):** lead checks this overlay against the already-approved concept + five active sidecars, runs existing binding verifiers and Speckit prerequisites/read-only `speckit.analyze` locally, resolves actual findings, then authorizes test-first implementation. This crosswalk does **not** add a sixth binding verifier or a second arbitrary approval gate.
