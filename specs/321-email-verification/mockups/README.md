# Issue #321 mockup status

## Sole approved revised visual reference

The sole approved revised image is:

- `verification-flow-approved.png`
- Git blob: `5969d493395b2b3fb4b9cd27f975b381cbf396dc`
- byte count: `1437770`
- SHA-256:
  `d1a0778e9d0fe00385eeb3c59e27e7428671a96b2eee91e851b3ef7d109e5976`

It is the approved six-panel board covering code-entry and success direction
across the pictured EN/AR and light/dark variants.

Its adjacent `verification-flow-approved.binding.md` is intentionally a
**PENDING** binding draft. Image approval does **not** approve the proposed
binding geometry/tokens/unknown-state rules. The board is therefore the sole
approved visual reference, but it is not yet an authoritative repository
image+metadata binding tuple.

Do not perform board-governed UI production changes until:

1. Mohamed explicitly approves the combined image-and-binding metadata tuple;
2. the sidecar approval fields are updated to the exact approved revisions and
   evidence reference;
3. `node scripts/verify-mockup-binding.js
   specs/321-email-verification/mockups/verification-flow-approved.binding.md`
   passes on those exact bytes.

## Historical repository images

These existing files remain historical evidence from the earlier link-first /
Check-your-inbox direction:

- `verification-en-light.png`
- `verification-en-dark.png`
- `verification-ar-light.png`

Their sidecars may remain internally valid for their own historical bytes, but
they are **not** current #321 visual-fidelity authority.

Do not compare the revised implementation against those three files and do not
claim final #321 visual fidelity from them.

## Evidence rules after binding approval

- Do not stretch the board's phone panels to manufacture a pixel comparison.
- Compare implementation at the approved/calibrated viewport defined by the
  final binding metadata.
- Treat unpictured states (focus, error, expired, active resend, in-flight
  verification, dark success) as compatibility/semantic-token evidence unless
  separately approved for pixel fidelity.
- Record functional, visual, and accessibility evidence separately.
