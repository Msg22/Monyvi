# Voice controls R2 — DRAFT binding context

**Feature:** #347 / `389-voice-usage-limits`  
**Source snapshot audited:** `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`  
**Published planning branch:** `codex/issue347-voice-controls-r2`  
**PNG commit/blob:** `b00b7ae07a7f75008f21ff2c9f8680f735153901` /
`caceb8d1cade9e4e9c574e95fc0e603a39e766de`  
**Owner image approval:** “latest mockups approved”  
**Binding metadata:** DRAFT pending root exact review/fingerprints

## Precedence

R2 is a narrow override layered on the owner-approved R1 motion package and the
five original repaired bindings. Once the R2 sidecar itself is approved, it
overrides only:

- recording/paused action label/color/fixed physical positions;
- elapsed/max timer plus the local 30-second active-capture cap;
- ordinary static filled mic halos in idle/Starting/recording/paused.

R1 remains authoritative for Starting, permission explanation, examples
dismissal, recording waves, parsing, retry identity, reduced motion and cleanup.
Original bindings remain authoritative for allowance, daily/burst/unavailable,
Manual, shell/tabs, quota semantics and unaffected geometry.

## Source facts that implementation must reconcile

- `hooks/useVoiceRecorder.ts:45-49` currently defines a 60-second maximum.
  `342-371` auto-stops without auto-submitting. Pause stops the timer and
  Resume restarts it, so paused time is already excluded by the timer model.
- `components/add-transaction/VoiceTransactionEntry.tsx:311-353` currently
  renders Stop/Pause/Discard while recording and Resume/Stop/Discard while
  paused. R2 changes only the user-facing submit label/order/treatment.
- The same component currently renders ordinary static halo backgrounds around
  the mic; R2 removes them from idle/Starting/recording/paused while retaining
  R1 recording waves and existing daily/unavailable disabled artwork.
- `voice-ui/VoicePresentation.ts:5-10` formats only elapsed time. R2 requires
  elapsed/max.
- `app/(private)/add-transaction.tsx:288` refreshes microphone permission
  before calling `flowStartFlow`; `useVoiceTransactionFlow.ts:376` refreshes
  it again. `useVoiceAiAvailability` also refreshes on focus/app-active, and
  the route may refresh before a retry/start. These are latency candidates only;
  no measured timing or safe-removal conclusion is asserted here.
- Genuine capture readiness remains native `record()` success. Starting may be
  immediate, but Listening/timer must not precede capture.

## Control and copy map

| State | LEFT | CENTER | RIGHT |
| --- | --- | --- | --- |
| Recording | Submit — green/NileGreen | Pause — gray/slate | Discard — red |
| Paused | Submit — green/NileGreen | Resume — gray/slate | Discard — red |

EN: Submit / Pause / Resume / Discard.  
AR existing: إيقاف مؤقت / متابعة / تجاهل.  
AR Submit DRAFT proposal: إرسال; requires root binding review.

The physical positions remain stable in Arabic; locale direction affects text
and surrounding locale-aware composition, not action identity.

## Timer and cap

- Active-capture maximum: 30,000 ms.
- Paused duration excluded.
- Display: `00:12 / 00:30`; capped: `00:30 / 00:30`.
- No helper sentence.
- At cap: stop/finalize locally, retain audio, wait for explicit Submit or
  Discard.
- Zero automatic Gemini/`parse-voice` invocation, allowance consumption or
  review navigation at the cap.
- Cap/Submit/Discard/cancel/unmount/user-switch races require one effective
  finalize/cleanup outcome and no stale resurrection.

## Visual/responsive map

- Preserve 104 dp mic and existing unboxed Voice area.
- Remove ordinary filled static halo backgrounds in
  idle/Starting/recording/paused.
- Preserve recording waves/ripples inside the existing area.
- Preserve daily-limit/unavailable artwork.
- Reuse registered tokens; no hardcoded color.
- Baseline and owner evidence matrix remains 390×844 plus 320×640 compact,
  768×1024 tablet, 844×390 landscape, EN/AR, light/dark, font scales 1.35/2,
  reduced motion and separate a11y proof.
- Three action targets remain ≥48 dp. Do not shrink text to preserve one row;
  use existing responsive rules and return any material unbound reflow choice to
  root/owner.

## Server and adjacent-lane boundaries

The local 30-second cap is approved product behavior. No authoritative server
duration enforcement is claimed. Issue #391 separately owns server-duration and
empty/speechless-audio research. The separate Voice UI lane owns a latency
addendum; this package records source candidates but does not duplicate that
analysis or promise a timing target.
