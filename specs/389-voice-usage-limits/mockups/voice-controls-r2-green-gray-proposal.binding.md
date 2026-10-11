# Mockup binding: voice-controls-r2-green-gray-proposal

<!-- prettier-ignore -->
- Reference image: voice-controls-r2-green-gray-proposal.png
- Reference image repository Git blob: caceb8d1cade9e4e9c574e95fc0e603a39e766de
- Owner image/concept approval: APPROVED — owner said “latest mockups approved”
- Binding metadata approval: DRAFT
- Binding metadata revision: PENDING ROOT VERIFIER
- Approved binding metadata revision: PENDING
- Binding approval revision: PENDING ROOT VERIFIER
- Approved binding approval revision: PENDING
- Binding metadata approval evidence/reference: Owner approved the revised PNG; root has not yet reviewed/approved this exact sidecar or its fingerprint tuple.
- Draft Binding Facts SHA-256 (informational, not the official verifier revision): sha256:df43f3bf25f7ac747f85497f29373f64875e55cc13cc83ba8f5301f10cb1971c
- Legacy metadata migration: no

## Binding Facts

- Binding product surface: Voice recording controls/timer and ordinary microphone decoration for the unified `/add-transaction` Voice surface. This R2 binding is a narrow continuation, not a new screen or a redesign of Manual, allowance, daily-limit, unavailable, consent, permission, review, quota, or provider behavior.
- Source artifact: `voice-controls-r2-green-gray-proposal.png`, repository Git blob `caceb8d1cade9e4e9c574e95fc0e603a39e766de`, published by the root on `codex/issue347-voice-controls-r2` at `b00b7ae07a7f75008f21ff2c9f8680f735153901`. The owner explicitly approved the revised PNG as “latest mockups approved”. The connector cannot decode repository PNG bytes, so the image-content SHA-256 and pixel dimensions remain pending root/local verification.
- Approval boundary: owner approval covers the revised PNG concept. Binding metadata remains DRAFT until root reviews these exact facts and records the exact computed approval tuple. No approval timestamp, approved binding revision, or combined approval revision is inferred here.
- Precedence: once this R2 binding metadata is approved, it supersedes R1 only for the recording/paused control labels, colors and fixed physical positions; the elapsed/max timer and 30-second local recording cap; and removal of ordinary static filled halo circles in idle/starting/recording/paused. R1 and the original five repaired bindings remain authoritative for every other state, copy, geometry, interaction, permission/consent, quota and Manual fact.
- Control order: during active recording, Submit is physically LEFT, Pause is physically CENTER, and Discard is physically RIGHT. While paused, Submit remains LEFT, Resume occupies the same CENTER position, and Discard remains RIGHT. The row does not swap when paused. Arabic localizes labels and text direction but preserves these physical action positions; do not reverse the action row merely because the locale is RTL.
- Control colors: Submit uses the existing registered NileGreen primary treatment; Pause/Resume uses the existing registered neutral/slate secondary treatment; Discard uses the existing registered red destructive treatment. No new palette values are introduced. All controls retain the shared minimum 48 dp interactive target.
- Control copy: English labels are `Submit`, `Pause`, `Resume`, `Discard`. Arabic retains the existing approved `إيقاف مؤقت`, `متابعة`, `تجاهل` for Pause/Resume/Discard. The R2 draft proposes `إرسال` for Submit; this exact new Arabic label is part of binding-metadata review and must not ship until root accepts the sidecar.
- Timer: recording and paused states show active captured time against the fixed local cap in `mm:ss / mm:ss` form, for example `00:12 / 00:30`; at the cap it reads `00:30 / 00:30`. Paused duration is excluded from elapsed recording time. The owner removed the ordinary helper sentence because the timer communicates the limit; do not add replacement explanatory copy.
- Local duration cap: active native capture is capped at 30,000 ms. Reaching the cap automatically stops/finalizes local recording and retains the audio for user choice; it MUST NOT automatically invoke Gemini, `parse-voice`, reserve/consume a provider allowance, or navigate to review. Explicit Submit remains the action that begins the existing submission/parsing path.
- Cap lifecycle safety: auto-stop and explicit Submit/Discard/cancel/unmount/account-change paths must be idempotent and race-safe. Pause near the cap freezes elapsed active time; Resume continues from that elapsed value toward 30 seconds. A cap callback arriving after discard/cancel/unmount/account change must not resurrect audio, timer, state, or provider work.
- Microphone decoration: ordinary idle, starting, recording and paused states remove the static filled gray/green halo-circle backgrounds around the mic. Recording retains the approved R1 outward recording waves/ripples; Paused retains a static reduced-motion/paused treatment without active waves. Existing daily-limit and unavailable disabled-mic artwork is explicitly outside this override and remains governed by prior bindings.
- Mic and layout geometry: preserve the existing 104 dp clipped circular mic target, unboxed Voice section, 16 dp ordinary horizontal gutter, 12 dp section gaps, 48 dp interaction minimum, 560 dp centered tablet maximum, single safe-area application and vertical scrolling. R2 does not authorize a new breakpoint or fixed viewport height.
- Theme: use existing registered light/dark semantic and palette tokens. The R2 green/gray/red control meaning is preserved in both themes with accessible contrast; do not hardcode colors or copy raster texture/shadows.
- Responsive variants: validate 320×640 compact, 390×844 ordinary, 768×1024 tablet, 844×390 landscape and font scales 1.35/2 using centralized UI breakpoints/reflow. The three controls remain associated with their fixed physical positions when the row fits; if enlarged text requires an approved reflow, preserve action meaning/order and 48 dp targets without shrinking text.
- RTL/Arabic: preserve existing Arabic tab order, text alignment, font and locale-specific Voice compositions. The recording control row is a stable physical action row as described above, not a locale-mirrored semantic reorder. Timer punctuation remains the approved slash-separated clock form.
- Reduced motion and cleanup: recording waves use the existing R1 reduced-motion and cleanup contract. R2 does not add amplitude/volume claims. Paused/cap/completed states must not leave an infinite recording animation running.
- Provider/server boundary: the 30-second rule is an approved local recording cap. It is not evidence that the server rejects audio longer than 30 seconds. Server-side duration validation/enforcement and empty/speechless-audio handling are tracked separately under issue #391 and require source research; client-declared duration is not authoritative server proof.
- Latency boundary: R2 requests a faster path, but this binding makes no millisecond promise. Current source has redundant permission/availability opportunities under separate read-only latency analysis. Optimization must not remove auth, AI consent, authoritative availability or genuine native-permission gates, and must never show Listening before native `record()` succeeds.
- Fidelity-affecting unknowns: repository connector access verified the exact Git blob and owner approval but could not decode the PNG bytes. Exact pixel dimensions, image SHA-256, and any visual fact not stated by the owner remain pending root/local review. No device/render/accessibility completion is claimed by this DRAFT sidecar.

## Scope and approval boundary

This sidecar does not edit or supersede the bytes, sidecars, manifests or
approval history of R1 or the original five repaired bindings. Root must compute
the official image SHA-256 and binding/combined revisions from the published
bytes and these exact facts, review any DRAFT interpretation (including Arabic
Submit), and record a new approval tuple before implementation.
