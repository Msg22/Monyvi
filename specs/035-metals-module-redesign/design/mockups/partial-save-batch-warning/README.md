# Partial-save batch warning — approved visual reference

Created directly by Codex lead for Mohamed's review. This replaces the earlier
worker-authored draft; that earlier artifact is not an approval source.

## Decision represented

When selected SMS or voice transactions contain invalid rows, valid rows may
still be saved. Invalid rows are skipped and must never affect account balances.
The warning appears before persistence and offers two choices:

- Review transactions: return without saving.
- Save valid transactions: persist only valid selected rows.

## Frames

- A: 390 × 844, English LTR, light theme.
- B: 320 × 693, English LTR, compact phone.
- C: 390 × 844, Arabic RTL, dark theme.
- D: 390 × 844, Arabic RTL, simulated 200% text.

## Status

APPROVED by Mohamed on 2026-09-23. The binding sidecar records the approved
reference and must continue to pass the repository binding verifier.
