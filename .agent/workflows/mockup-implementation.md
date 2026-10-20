---
description:
  Interactive Monyvi UI creation; historical image binding compatibility
---

# Interactive mockup creation

For **future** meaningful UI changes, follow
[interactive design workflow](../../docs/design/interactive-design-workflow.md)
and the scoped gate in `sprint-issue.md`. The **runnable design itself** is the
visual/responsive/interaction reference. No future interactive `*.binding.md`
sidecar, verbose Binding Facts, separate metadata approval, artifact-hash
manifest or verifier step is required.

- Scope the affected screen/component and exercise relevant interactions,
  states, actual container widths, long names/content, theme, EN/AR RTL and font
  scaling. Use Monyvi tokens and already approved product semantics; no invented
  financial fields/writes or new feedback toasts.
- Normally save portable HTML/CSS/JS under the feature's `mockups/`, with a
  **runnable entry** and **short README** for version/traceability, opening or
  running it, scenario controls, necessary native-only differences and known
  limitations. Do not confuse raw source fragments with the working entry. Use
  synthetic, non-sensitive data and no live Gemini/Supabase/financial writes.
- Screenshot/image exports and optional design tools (including Stitch) can
  inform the design but do not replace the interactive artifact. No mandatory
  four-alternative/static mockup matrix or extra framework.
- Present the **exact working design revision once** for owner design approval.
  Record the reviewed version in the normal feature handoff; do not seek a
  second approval of its README, sidecar or description. A materially changed
  design receives a new revision and one new design approval.
- Native implementation remains real React Native/Expo, not browser HTML/CSS.
  Compare rendered native screenshots with the rendered approved design and
  validate native insets, keyboard and accessibility separately. Do not claim a
  visual/device pass without native evidence.

## Historical image reference migration — historical surfaces only

Previously approved image-only references remain frozen and can still govern
their original features. They are not retroactively converted to HTML. When a
pre-sidecar approved image needs to be implemented, follow the existing
evidence-based migration requirements:

#### Legacy Approved Mockup Metadata Migration

Approved references created before the binding-sidecar rule remain valid when
their approval can be evidenced. A missing sidecar on such a reference is a
metadata-migration requirement, not a reason to discard or replace the approved
mockup.

Before implementation of a legacy approved reference:

1. Verify that the image was actually approved using existing evidence such as
   the canonical spec/design handoff, recorded user approval, or the PR/review
   artifact that established the approved reference. Do not infer approval from
   filename or location alone. Compute the exact image-byte SHA-256 and
   reconcile it with any existing canonical integrity table or approval record.
2. Create the matching `<mockup-basename>.binding.md` sidecar in the same
   directory **before implementation**, starting from the canonical template.
   Mark it as `Legacy metadata migration: yes`, record
   `Approved reference image revision: sha256:<64 lowercase hex>` for the exact
   evidenced image bytes, set approval status and both approved revision fields
   to `PENDING`, compute `Binding approval revision`, and list exact evidence
   sources.
3. Populate only binding facts supported by the approved reference, recorded
   approval/handoff, authoritative design/spec documentation, or design-system
   facts that applied to that approval. The constitution's default rule that
   presentation-only hardware/frame/canvas/chrome/export padding is non-binding
   applies unless the approved handoff explicitly says otherwise.
4. Record every unresolved required binding fact as `UNKNOWN`, including the
   viewport/component context, spacing, sizing, color/theme, typography, or
   visible state, interaction behavior, or transition behavior when it is not
   evidenced. Classify each unknown as fidelity-affecting or
   non-fidelity-affecting.
5. If any fidelity-affecting unknown remains, pause and obtain clarification
   before UI implementation, then update the sidecar with the approved answer.
6. Present the approved legacy image and completed migrated sidecar together for
   explicit approval of the exact image, metadata, and combined approval
   revisions. Legacy image approval does not implicitly approve reconstructed
   metadata. Only after explicit approval may the sidecar be marked `APPROVED`,
   with both current revisions copied into their approved fields and approval
   evidence identifying the approved combined revision. Run the verifier before
   treating the sidecar as authoritative.
7. Do not alter the approved legacy image to make metadata fit, manufacture
   measurements from uncalibrated export framing, or create speculative sidecars
   outside the currently authorized task.

## Historical verifier scope

Historical approved image references, their existing sidecars, original
hashes/combined approvals, and evidence retain their exact authority **only for
their original governed surfaces**. Do not edit those frozen artifacts. For
those historical image-backed surfaces, consume the applicable approved sidecar
and unchanged `scripts/verify-mockup-binding.js` result; follow the
evidence-based migration procedure above if an old image lacks an authoritative
sidecar. **Never apply that procedure or the verifier to a new interactive HTML
design.** For either reference type, report functional, native rendered visual,
accessibility and owner manual statuses separately.
