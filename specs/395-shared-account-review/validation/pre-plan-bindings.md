# Pre-plan binding validation

Date: 2026-10-14. Scope: documentation and proposed visual handoff only.

- Exact current spec SHA-256 matches the explicit owner approval receipt.
- All 23 image-byte SHA-256 values match their existing image manifests;
  unchanged approved reference/proposal bytes.
- All 23 sidecar image, Binding Facts and combined-revision hashes match the
  canonical `scripts/verify-mockup-binding.js` calculations and B1 manifest.
- Pinned common contract, interaction/copy notes and owner adjustment hashes
  match; review index contains all image/sidecar/combined-revision pairs.
- The canonical verifier reports precisely the four expected approval failures
  for every sidecar: pending status, pending approved metadata revision, pending
  approved combined revision and missing explicit approval evidence. There are
  no image or metadata-integrity errors. **No authoritative PASS is claimed.**
- Historical approval/provenance remains; the two duplicate #389 draft folders
  are absent. There is no new `plan.md`.
- Documentation formatting and whitespace checks run together before commit;
  normal repository commit/push hooks remain enabled.

After explicit B1 approval, record that approval for the exact combined
revisions and rerun the canonical CLI verifier over all sidecars. Only a passing
approved verifier result closes the visual gate before `speckit-plan`.

No app code changed. Unit, E2E, emulator, rendered pixel/contrast and device
accessibility checks were not run or claimed for this preparation. Future
implementation coverage remains in the manual plan; owner runs device checks.
