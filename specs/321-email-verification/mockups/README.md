# Issue #321 mockup status

## Revised code-first flow

Mohamed explicitly approved the revised code-entry and Email verified visual
direction on 2026-10-04.

That approved direction includes:

- 6-digit code entry;
- 10-minute expiry presentation;
- 2-minute resend cooldown presentation;
- no permanent paste helper copy;
- no permanent auto-submit helper copy;
- no "resends left today" copy;
- Email verified success state with explicit Continue;
- English/Arabic and light/dark variants.

## Historical repository images

The currently committed files:

- `verification-en-light.png`
- `verification-en-dark.png`
- `verification-ar-light.png`

and their `.binding.md` sidecars are the earlier **link-first / Check your
inbox** references approved on 2026-09-21.

Their hashes and sidecars remain internally valid historical evidence, so the
binding-integrity test continues to guard them. They are **not** the final
visual-fidelity authority for the revised code-first implementation.

Do not claim final #321 visual fidelity from those historical PNGs.

## Remaining binding work

Before final visual sign-off:

1. persist the exact approved revised code-entry/success image bytes;
2. create/update binding sidecars for those exact files;
3. record the revised Binding Facts and approval evidence;
4. run `scripts/verify-mockup-binding.js` against the revised references;
5. capture implementation evidence against the revised approved references.

This is tracked as R009, R010, R075, and R082 in `../tasks.md`.
