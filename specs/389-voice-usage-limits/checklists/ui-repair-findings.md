# UI fidelity repair findings

## Why presentation drifted

The repository already had mandatory mockup approval and visual review rules.
This was an execution and acceptance gap, rather than evidence that generic
design guidance was absent.

- The older mockup-1/mockup-2 package and later transaction-voice EN/AR files
  described different compositions. The repair explicitly selected and froze
  five replacement bindings so authors could not treat either generation as
  interchangeable. The old English examples heading belonged to the older
  approved package; it was not historically unapproved copy.
- The previous direct-implementation delivery retained deferred
  visual/accessibility gates. Passing source, unit or CI checks did not
  establish rendered fidelity. The owner now retains device and visual
  execution; that boundary is still explicit.
- Source-to-binding review found local control duplication despite the shared
  Dropdown requirement, missing locale font selection, incomplete tablet
  alignment and the 4dp default label gap against the approved 8dp gap. These
  are concrete pattern/typography enforcement gaps.
- Generic RTL heuristics also produced two invalid review suggestions. The exact
  Arabic raster places allowance/examples badges physically left and uses an
  information glyph in the passive reset strip. Those deliberate reference
  details must be preserved, rather than automatically mirrored or substituted.

## Enforced correction

The applying-mockups/team-led workflow and frontend/product/visual personas now
require inspection of active image pixels, frozen binding identity, explicit
state/copy/icon/geometry and existing-component mapping, then independent
source-to-binding review. Presentation reuses PageHeader, grouped money input,
Dropdown and OptionalSection. Locale fonts and shared responsive rules are
explicit. No original reference bytes or five approved binding facts were
changed.

## Voice availability warning

The message is recovery copy after an authoritative Voice availability request
fails: transport, HTTP, auth or malformed response/configuration can prevent
confirmation. It must appear only in Voice, never on Manual or as a
loading/daily-exhaustion substitute. A read-only listing of yulbcndyssdjicbpmlrk
showed parse-voice present and voice-ai-availability absent. If the app uses
that project, missing deployment is a likely cause; the specific phone HTTP
exchange remains unverified. No hosted deployment or migration was performed.

## Additional verified defects

Executed regressions reproduced three duplicate-write cases during rapid Manual
Save and route switching/back during a pending Manual write. The repair uses a
synchronous submission guard and route interaction lock without changing atomic
financial operations. Expanded optional details must close when amount focus
opens the calculator, and ordinary native text focus must dismiss on Manual
deactivation while retaining the draft. Source review also verified that React
Native Keyboard.dismiss blurs the currently focused input: invoking it inside
amount onFocus can trigger a later onBlur and close the keypad. The focus path
must preserve the newly focused amount and suppress the soft keyboard with the
shared input prop, while deactivation retains explicit keyboard cleanup.

## Acceptance boundary

Final unit/type/lint/hook evidence is recorded in the repair coverage ledger and
PR. Maestro flows are authored and syntax-checked only. Exact rendered
comparison, native keyboard/audio/permissions, real theme/font behavior and
accessibility remain owner manual evidence under the explicit no-emulator
instruction. Source acceptance never substitutes for those checks.
