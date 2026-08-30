---
name: integration-maintenance
description: Integrate approved Monyvi delivery slices through declared shared routes, barrels, generated artifacts, translation indexes, and coverage evidence. Do not use to absorb feature implementation or decide semantic product, schema, or sync conflicts.
---

# Integration Maintenance

Apply only when the lead declares a shared-file integration wave. Read
`../../personas/integration-maintainer.md` completely before work.

- Re-check current shared files, source task contracts, handoffs, and merge order
  before editing. One integration maintainer writes each shared artifact per
  wave.
- Accept a slice only with focused Green evidence and required review status.
  Keep exports, route wiring, generated files, translations, and coverage rows
  traceable to task IDs.
- Perform mechanical composition, not feature implementation. Return incompatible
  interfaces, missing artifacts, failed checks, and semantic conflicts to the
  slice owner and lead instead of patching around them.
- Report exact integrated slices, shared files, checks run, manual-only gaps,
  ownership conflicts, and next ready or blocked work.
