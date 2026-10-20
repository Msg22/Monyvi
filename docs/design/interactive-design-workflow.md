# Interactive design workflow

**Owner-approved policy: 2026-10-20 (simplified).** Applies prospectively to
meaningful Monyvi UI designs created by any model, worker or tool. Follow the
existing sprint UI/design approval gate and its narrow micro-UI exception. This
policy supersedes earlier requirements for _future interactive_ binding
sidecars, duplicate approvals and reference-file hash ceremonies. It does not
change already approved historical image/mockup bindings or product, financial,
privacy, security and delivery safeguards.

## Design artifact is the authority

1. Deliver a **runnable interactive design** under the feature's
   `specs/<feature>/mockups/` folder. Prefer portable HTML/CSS/JS with a
   directly usable `index.html`, or document exact run steps if needed. Optional
   source fragments are editable source, **not** the runnable entry. Stitch,
   Figma, images and screenshots are optional inputs/evidence, never required
   substitutes for the working design.
2. The **reviewed runnable artifact itself** is the visual, spacing, styling,
   interaction and responsive design authority. Do **not** duplicate its
   layout/typography/states into a long normative binding sidecar, binding
   metadata table, hash manifest or second textual source of truth. Scope
   concepts and scenarios to the feature; four static alternatives and
   exhaustive cosmetic/device matrices are not mandatory.
3. Include a **short README** stating:
   - design name/version and traceable revision or link to the reviewed files;
   - the runnable entry and how to open/run it (including any external
     dependencies or offline limits);
   - relevant interaction/state/theme/locale/font/width scenarios to try;
   - necessary **native-only adaptations** and known simulation limitations (for
     example safe areas, keyboard, accessibility/touch and navigation). Avoid
     restating CSS measurements, visual layout or code already observable in the
     interactive artifact. The versioned feature folder or published Git
     revision can provide traceability; **no mandatory SHA-256 approval tuple,
     asset-hash manifest or sidecar is required** for new interactive designs.
4. Use synthetic, non-sensitive fixtures. No Gemini, Supabase, banking calls,
   real private records, auth, persistence, financial writes or new server/
   package unless specifically justified and authorized.
5. Make controls genuinely exercise relevant states and interactions. Check
   representative **actual available container** widths, long financial
   names/content, font scaling, light/dark and EN/AR RTL when in scope. Keep
   content inline while it fits and reflow when it does not, without orphan
   separators or lost financial identity. Visually compact icons can have larger
   accessible hit areas. The browser cannot prove native safe area, keyboard,
   screen-reader or physical touch behavior.
6. **One owner approval** is required for the exact runnable design revision
   actually presented. Record which version/artifact was approved using the
   existing feature handoff/issue/approval note; do not ask separately to
   approve a README, metadata, binding or digest of that same design. A
   materially revised design is a **new proposed revision** and needs its own
   single design approval. Preserve prior approval history without retroactively
   approving later changes.

## From approved design to React Native

Build with existing Monyvi React Native/Expo components, NativeWind tokens,
localization and accessibility patterns; browser HTML/CSS is a **reference**,
not production UI. Preserve the approved visual hierarchy and interactions at
the reviewed comparison context; adapt responsively to real native container and
content fit. Preview controls, browser chrome and decorative device framing are
not product UI unless clearly part of the approved screen.

Review relevant runnable scenarios, then compare **actual native rendered**
screenshots against the rendered approved design at corresponding sizes, states,
themes and locales. Check required native safe area, keyboard, accessibility and
effective touch targets separately. Source assertions, working HTML and passing
tests do not prove native visual fidelity. If device or rendered validation was
not performed or authorized, report **NOT RUN / visual fidelity unverified** and
give the owner practical manual checks. Keep functional readiness, native visual
evidence, accessibility and owner acceptance separate.

## Historical static/image references only

Already approved historical images, their binding sidecars, original
`Binding Facts`, exact hashes, combined approval revisions, verifier results and
evidence retain their original authority **for the UI surfaces they govern**. Do
not modify or re-approve those historical bytes.
`scripts/verify-mockup-binding.js`, the existing binding template and the legacy
migration rules apply **only when consuming those historical image/sidecar
references**. They are **not** prerequisites for new interactive HTML designs,
nor a reason to create a new HTML binding sidecar.
