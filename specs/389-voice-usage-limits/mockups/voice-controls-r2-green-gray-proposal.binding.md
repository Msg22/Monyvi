# Mockup binding: Voice controls R2 — green/gray/red

<!-- prettier-ignore -->
- Approved reference image: voice-controls-r2-green-gray-proposal.png
- Approved reference image revision: sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281
- Reference image repository Git blob: caceb8d1cade9e4e9c574e95fc0e603a39e766de
- Verified image dimensions: 1832 × 858 pixels
- Verified image file size: 1470108 bytes
- Owner image/concept approval: APPROVED — “latest mockups approved”
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b
- Approved binding metadata revision: sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b
- Binding approval revision: sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77
- Approved binding approval revision: sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77
- Binding metadata approval evidence/reference: Owner approved the latest green/gray/red PNG; the local executor verified its exact image SHA-256, 1832 × 858 pixel dimensions, 1470108-byte size and matching published Git blob. Root's faithful review accepts the scoped visual facts, fixed physical action order, removal of ordinary helper copy, slash timer, 30-second retention, Arabic Submit إرسال and completed title التسجيل مكتمل. On 2026-10-11 root reviewed the public verifier results and, under delegated authority, accepted binding metadata revision sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e and combined approval revision sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14 as the approved revisions; Binding metadata approval is now APPROVED. Owner approval remains the image/concept only; do not attribute these fingerprints to a separate owner SHA review. On 2026-10-11 root, under delegated authority, additionally accepted the faithful binding-facts refinement pinning Submit filled registered NileGreen with white label and paper-plane Ionicons send icon, transparent neutral-gray outlined Pause/Resume with matching gray label and pause/play glyph, transparent registered red outlined Discard with matching red label and close glyph, completed gray disabled center Pause with pause glyph, 20 dp action icons and 14/22 semibold labels; this supersedes the prior accepted tuple (metadata sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e, combined sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14), yielding current metadata revision sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b and combined approval revision sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77 from the official verifier. PNG bytes unchanged. Owner did not review either computed SHA. Final canonical verifier PASS, correct-feature prerequisites and read-only Speckit analysis remain root-owned before implementation.
- Legacy metadata migration: no

## Binding Facts

- Binding product surface: Three R2 Voice recording-control states (recording, paused and recording complete after local auto-stop) in the existing standalone /add-transaction Voice surface, plus narrowly scoped ordinary microphone-decoration changes for idle/Starting/recording/paused. No Manual, quota, availability, permission, AI consent, parsing, account, subscription or review redesign.
- Declared comparison context: Owner-approved R2 composite PNG is exactly 1832 × 858 image pixels and 1470108 bytes, sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281, published as Git blob caceb8d1cade9e4e9c574e95fc0e603a39e766de. The composite is not a 1832 × 858 logical-dp screen: inherit the approved app comparison baseline 390 × 844 logical dp, font scale 1, test fixture safe insets top 24/bottom 34 dp and actual runtime insets exactly once.
- Presentation-only framing: Generated multi-panel canvas, illustrative device status/home/bottom navigation, panel framing, decorative texture and any incidental image scaling do not authorize a new screen, bottom tab bar, density, spacing token, shadow, or UI coordinate. Preserve the existing PageHeader, underline Manual/Voice tabs, unboxed Voice composition and standalone back navigation.
- Spacing facts: Inherit 16 dp horizontal content gutters, 12 dp inter-section gaps, 16 dp card padding, 8 dp label/helper or example-row gaps where applicable; keep ordinary Voice content scrollable rather than pinning it to export height. Controls appear as one stable physical LEFT/CENTER/RIGHT sequence, with responsive gaps using existing layout patterns, not measured from composite pixels.
- Sizing facts: Existing circular gradient mic target is 104 dp with native circular clipping; its ordinary decorative region remains bounded by the existing 140/172 dp geometry for animated recording waves, but static filled 140/172 dp backgrounds are removed in scoped states. Existing unboxed Voice section minimum 260 dp, PageHeader minimum 56 dp, underline tabs minimum 48 dp with 2 dp underline, card radius 16 dp/border 1 dp, and ALL action targets ≥48 dp remain. Tablet centered content max width 560 dp; no new fixed-height screen.
- Color/theme facts: Submit uses a filled registered NileGreen primary GREEN treatment with white label and paper-plane Ionicons send icon; Pause/Resume uses a transparent neutral-gray outlined treatment with matching gray label and pause/play glyph; Discard uses a transparent registered RED outlined treatment with matching red label and close glyph, including a red Discard on the right in every state. At the 30-second cap the disabled center Pause remains gray disabled with its pause glyph. Action icons are 20 dp and labels remain 14/22 semibold. Preserve the existing NileGreen-500/-600 mic gradient, approved semantic light/dark surfaces, and accessibility contrast. No new palette, hardcoded colors, volume-measurement styling or copying unverified screenshot textures.
- Typography facts: Existing Inter English and Noto Sans Arabic fonts; inherit shared 22/32 bold header, 16/26 semibold tabs, 18/28 bold state headings, 14/22 body and 12/20 helper/reset styles where applicable. Timer uses readable tabular mm:ss / mm:ss presentation and may wrap/reflow without shrinking labels. Ordinary recording helper sentence is REMOVED, not replaced.
- State facts: Panel 1 RECORDING shows physical LEFT Submit (green), CENTER Pause (gray), RIGHT Discard (red), elapsed/max timer such as 00:12 / 00:30, and R1 outward listening waves but no static filled ordinary halos. Panel 2 PAUSED keeps LEFT Submit (green), CENTER Resume (gray), RIGHT Discard (red), frozen active elapsed/max time and NO moving listening waves. Panel 3 RECORDING COMPLETE / التسجيل مكتمل after reaching cap shows 00:30 / 00:30, LEFT Submit (green), CENTER disabled Pause (gray), RIGHT Discard (red), retained locally finalized audio, NO active recording waves, NO Resume, and NO helper sentence. Idle/Starting also omit ordinary static filled halos. Existing daily-limit/unavailable disabled mic graphics are outside R2 and unchanged.
- Interaction behavior: Submit / إرسال is the explicit user action that finalizes if still recording/paused and enters the existing guarded retained-audio submission/parsing flow once; after cap it submits the already-finalized audio once. Pause / إيقاف مؤقت and Resume / متابعة change native capture and active elapsed time only when valid; the completed panel disables Pause and offers no Resume. Discard / تجاهل deletes/cleans retained audio and never triggers the provider. No automatic Gemini/parse-voice call, provider-start allowance consumption, or review navigation at the cap.
- Transition behavior: The client records at most 30,000 ms of ACTIVE captured audio, excluding paused wall time. Pause freezes elapsed and moving waves; Resume advances from actual accumulated active time. At cap, native stop/finalization is automatic and idempotent, timer clamps to 00:30 / 00:30, audio URI remains for explicit Submit or Discard, and the screen becomes Recording complete. Cap races with Submit/Discard/cancel/unmount/account change must not duplicate stops, resurrect state/audio/timer or start provider work. Preserve true native record() success before Listening/timer, early-command native 300 ms stabilization, and R1 reduced-motion/cleanup guarantees.
- Responsive variants: Reuse centralized breakpoints/reflow for 320 × 640 compact, 390 × 844 ordinary, 768 × 1024 tablet (max content 560 dp) and 844 × 390 landscape. Keep visible ≥48 dp targets, vertical scrolling and a stable physical action identity. If a narrow/enlarged layout cannot fit labels, reflow using existing patterns without truncation, font shrinking or action swapping; any materially new layout requires owner review rather than a guessed export measurement.
- Dark-mode variants: Preserve the existing light/dark semantic backgrounds, native-clipped mic gradient, visible green/gray/red action hierarchy, readable disabled center control, and accessible contrast. R2 removes only ordinary filled halo circles; existing dark daily-limit/unavailable disabled artwork and R1 reduced-motion-static/recording-wave contracts remain.
- RTL/Arabic variants: English labels Submit/Pause/Resume/Discard; Arabic Submit إرسال, Pause إيقاف مؤقت, Resume متابعة, Discard تجاهل and completed title التسجيل مكتمل are accepted faithful bindings. Physical Submit stays LEFT, Pause/Resume stays CENTER, Discard stays RIGHT in Arabic as in English; no row-reverse of the action identities. Arabic text/fonts, content RTL direction and pre-existing Arabic-specific quota/examples layouts remain. Timer shows literal slash-separated mm:ss / mm:ss, including 00:30 / 00:30 at cap.
- Enlarged-text variants: Validate font scales 1.35 and 2 with text wrapping, scroll, visible elapsed/max timer, clear disabled center state and ≥48 dp touch sizes. Never shrink fonts or silently reverse Submit/Pause/Discard. Separate RTL, screen-reader focus/roles, high contrast and reduced-motion proof remain owner owned.
- Fidelity-affecting unknowns: Source image bytes/SHA-256, pixel dimensions and size are locally verified; logical export density and exact per-panel stroke widths, shadows, inter-control pixel distances, easing, unapproved narrow-row reflow or native timing are NOT established by a framed raster. New image approval does not prove device rendering or server 30-second enforcement. Root must verify official final Binding Facts/combined SHA and record truthful delegated acceptance before claiming this sidecar APPROVED; separate owner native/render/accessibility evidence remains NOT RUN.

## Scope and approval boundary

The owner approved the latest image concept. The root's faithful review accepts the
fixed positions/colors, elapsed/max slash timer, no helper sentence, retained
audio after the local 30-second cap and the Arabic Submit/completed wording.
**Superseding acceptance receipt (2026-10-11):** Root verified the public
verifier results and, under delegated authority, accepted binding metadata
revision `sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e`
and combined approval revision
`sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14`;
the binding approval metadata above is APPROVED using those actual computed
revisions and truthful delegated provenance. The owner was not separately
shown either SHA. Final canonical verifier PASS, correct-feature
prerequisites and read-only Speckit analysis remain root-owned before
implementation.

**Superseding faithful-refinement receipt (2026-10-11):** Root, under
delegated authority, accepted the exact Color/theme facts refinement
recorded in the evidence line (filled NileGreen Submit with white label
and paper-plane Ionicons send; transparent gray Pause/Resume outlined
with pause/play glyph; transparent red Discard outlined with close
glyph; gray disabled completed Pause with pause glyph; 20 dp icons;
14/22 semibold labels). The current approved tuple is metadata
`sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b`
and combined
`sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77`
from the official verifier algorithm, superseding the earlier receipt
tuple; PNG bytes and all other facts are unchanged. Owner did not review
the computed SHA. T068 and final root computed-verifier review remain
pending.

R2 supersedes R1 only for the specified ordinary recording/paused/completed
controls, elapsed/max local cap and static filled halo removal. It preserves the
original five approved image/binding bytes, approved R1 images/sidecars and all
existing auth, consent, authoritative quota, request/replay identity, Manual,
financial, parsing, provider and same-key retry contracts. Issue #391 separately
owns empty/speechless audio and authoritative server duration research.
Preimplementation read-only Speckit analysis remains mandatory after exact
binding verification and before source/tests; no renderer, native, OS or provider
evidence was collected by this planning author.
