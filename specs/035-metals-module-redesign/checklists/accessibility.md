# Accessibility Requirements Checklist: Metals Module Redesign

**Purpose**: Audit accessibility, localization, RTL, contrast, reflow, assistive-technology, and recovery requirements before mockup and implementation planning
**Created**: 2026-08-25
**Feature**: [Metals Module Redesign](../spec.md)

**Note**: This checklist evaluates the quality of accessibility requirements, not an implementation or accessibility test run.

## Language and Financial Terminology

- [ ] CHK001 Are all user-visible states and actions required to use natural English and Arabic financial terminology rather than literal or technical translations? [Completeness, Spec §FR-065]
- [ ] CHK002 Are distinct Arabic and English meanings required for Sell, Dispose, Delete holding, Undo, write-off, external transfer, sold-metal profit/loss, and since-purchase performance? [Clarity, Spec §User Stories 5–8, FR-065]
- [ ] CHK003 Are incomplete-historical-data, unavailable-attribution, stale-rate, unknown-freshness, and conflict explanations required in both languages without implying zero or certainty? [Coverage, Spec §FR-057–FR-059, FR-074–FR-075, FR-080]
- [ ] CHK004 Are locale-appropriate numbers, currencies, dates, weights, purities, and relative-time requirements defined consistently across summaries, forms, reviews, and History? [Consistency, Spec §FR-065]
- [ ] CHK005 Is the terminology source or approval owner for high-impact Arabic financial and destructive copy documented? [Dependency, Gap]

## RTL and Bidirectional Meaning

- [ ] CHK006 Does the RTL requirement preserve financial meaning and action order across every screen, review, filter, and destructive confirmation? [Completeness, Spec §FR-066]
- [ ] CHK007 Are bidirectional-isolation requirements documented for mixed Arabic/Latin numbers, account names, user-entered holding names, and notes? [Gap, Spec §FR-065–FR-066]
- [ ] CHK008 Are positive and negative signs, percentages, decimal separators, and P/L direction required to remain attached to the correct numeric value in LTR and RTL? [Clarity, Spec §FR-065–FR-066]
- [ ] CHK009 Are currency symbols and codes required to retain unambiguous association and order with amounts in Arabic and English? [Clarity, Spec §FR-065–FR-066]
- [ ] CHK010 Are weight, per-gram, purity, karat, and fineness units required to remain readable and semantically attached to their values under RTL? [Completeness, Spec §FR-065–FR-066]
- [ ] CHK011 Are absolute dates, relative times, and stale-rate ages required to retain correct chronology and reading order under RTL? [Consistency, Spec §FR-054, FR-065–FR-066]
- [ ] CHK012 Are directional navigation symbols and ordered History relationships required to mirror visually without reversing chronology or action meaning? [Clarity, Spec §FR-005, FR-040, FR-066]

## Assistive-Technology Semantics

- [ ] CHK013 Are role, label, value, state, and consequence requirements complete for every interactive control, including compact links, filters, selectors, disclosure controls, and History rows? [Completeness, Spec §FR-067]
- [ ] CHK014 Are portfolio totals, P/L, rate age, attribution trust, and unavailable values required to have understandable spoken summaries rather than disconnected numeric fragments? [Gap, Spec §FR-016, FR-046–FR-059, FR-067]
- [ ] CHK015 Are selected, expanded, collapsed, disabled, pending, stale, unknown, Sold, Disposed, reversed, conflicted, and read-only states required to be exposed without visual inference? [Coverage, Spec §FR-067–FR-068, FR-074, FR-076, FR-080]
- [ ] CHK016 Are All, Gold, Silver, Sold, and Disposed filters required to expose their names, selected states, result counts when available, and empty-result meaning? [Gap, Spec §FR-003, FR-005, FR-067]
- [ ] CHK017 Are attribution disclosure requirements complete for announcing availability, expanded state, component labels, signs, and reconciliation to the combined result? [Completeness, Spec §FR-050–FR-052, FR-067]
- [ ] CHK018 Are disabled or unavailable financial actions required to include an accessible explanation and recovery path rather than only an unavailable state? [Clarity, Spec §FR-017, FR-023–FR-024, FR-038, FR-045, FR-067]
- [ ] CHK019 Are pending, success, failure, retry, and preserved-input outcomes required to be communicated promptly through assistive technology? [Completeness, Spec §FR-076–FR-078]

## Focus, Reading Order, and Controls

- [ ] CHK020 Are logical reading and focus-order requirements defined for summaries, forms, progressive disclosures, sticky actions, reviews, and History timelines in LTR and RTL? [Gap, Spec §FR-066–FR-069]
- [ ] CHK021 Are focus-entry and focus-return outcomes documented for full-screen flows, confirmations, disclosure panels, errors, and completed actions? [Gap]
- [ ] CHK022 Are requirements defined to keep background actions unreachable while a consequential confirmation is active and to provide a clear accessible dismissal path? [Gap, Spec §FR-037, FR-055, FR-072]
- [ ] CHK023 Are keyboard, switch-control, and external-input access requirements intentionally covered by the general assistive-technology contract or explicitly excluded? [Ambiguity, Spec §FR-067]
- [ ] CHK024 Is the 44-by-44 minimum target requirement clearly applicable to icons, text links, segmented filters, purity choices, disclosure controls, retry actions, and confirmation controls? [Clarity, Spec §FR-067, SC-011]
- [ ] CHK025 Are requirements present to prevent adjacent consequential actions from becoming ambiguous or difficult to target at compact sizes and enlarged text? [Gap, Spec §FR-069]

## Contrast and Non-Color Communication

- [ ] CHK026 Are light- and dark-theme contrast thresholds explicit for normal text, large text, meaningful non-text information, focus indicators, disabled states, and form errors? [Completeness, Spec §FR-071, SC-013]
- [ ] CHK027 Are profit, loss, stale, unknown, unavailable, success, failure, terminal, and destructive states required to use text or symbols in addition to color? [Completeness, Spec §FR-068, FR-071]
- [ ] CHK028 Is stale or unknown rate meaning required to replace any misleading “Live” wording rather than relying on a changed color indicator? [Clarity, Spec §FR-054–FR-056, FR-074]
- [ ] CHK029 Are Gold and Silver distinctions required to remain understandable without metal color or decorative material treatment? [Gap, Spec §FR-003, FR-017, FR-068]

## Enlarged Text, Reflow, and Motion

- [ ] CHK030 Are enlarged-text requirements explicit about reflow of long Arabic labels, currencies, dates, P/L values, filters, and destructive consequence copy without clipping essential facts? [Clarity, Spec §FR-069, SC-010]
- [ ] CHK031 Are compact, ordinary, tablet, portrait, and landscape requirements consistent about reachable actions and readable financial relationships under enlarged text? [Consistency, Spec §FR-069, SC-010]
- [ ] CHK032 Are requirements defined for preserving complete values and consequences when one-line truncation or side-by-side composition no longer fits? [Gap, Spec §FR-069]
- [ ] CHK033 Are reduced-motion requirements explicit about which state changes, progress, disclosure, success, and error meaning must remain when motion is removed? [Ambiguity, Spec §FR-069]

## Error, Confirmation, and History Accessibility

- [ ] CHK034 Are field-specific validation messages required to identify the affected field, explain the problem in plain language, and state a recovery action in English and Arabic? [Completeness, Spec §FR-012–FR-014, FR-065, FR-078]
- [ ] CHK035 Are error-summary and focus-placement requirements documented for long Add, Edit, Sell, and Dispose flows containing multiple invalid fields? [Gap]
- [ ] CHK036 Are stale-rate acknowledgments required to name each affected metal or FX input, its age or unknown freshness, and the consequence before financial confirmation? [Clarity, Spec §FR-055, FR-074–FR-075]
- [ ] CHK037 Are Sell, Dispose, Delete, and Undo confirmations required to communicate distinct consequences through heading, body, action label, and assistive-technology description? [Completeness, Spec §FR-028, FR-037, FR-043–FR-045, FR-072]
- [ ] CHK038 Are History timeline and filter requirements complete for spoken chronology, event type, effective versus non-effective conflict state, correction/reversal relationships, and current selection? [Coverage, Spec §FR-005, FR-040–FR-045, FR-080]
- [ ] CHK039 Can language, RTL, target-size, contrast, reflow, color-independence, and assistive-label outcomes be objectively assessed from the specified success criteria? [Measurability, Spec §SC-010–SC-013]

## Notes

- Check items off as completed: `[x]`
- Add findings and requirement references inline.
- Keep implementation and device-audit observations outside this requirements checklist.

## Reconciliation — 2026-08-25

**Authority**: This ledger is the current resolution status; the unchecked questions above remain unchanged as historical requirements tests.

### Satisfied

- **CHK007** — Satisfied by `FR-065`, `FR-066`, `SC-010`, and `SC-029`: mixed-direction financial and user-entered content must retain semantic association in English/Arabic and LTR/RTL.
- **CHK014** — Satisfied by `FR-092`, `FR-099`, `SC-011`, and `SC-029`: totals, P/L, trust, provenance, unavailable values, and lifecycle/conflict states require coherent spoken summaries.
- **CHK016** — Satisfied by `FR-003`, `FR-005`, `FR-067`, `FR-099`, and `SC-030`: every portfolio and History filter exposes its accessible name, selected state, count, and empty-result meaning.
- **CHK020, CHK021** — Satisfied by `FR-066`, `FR-092`, `FR-099`, `SC-028`, and `SC-029`: logical reading/focus order, entry, completion, error placement, and trigger restoration are explicit across flows and confirmations.
- **CHK022** — Satisfied by `FR-076`, `FR-092`, `FR-099`, `SC-015`, and `SC-028`: consequential confirmations isolate background content, contain focus, allow safe pre-submit dismissal, and block dismissal during pending local completion.
- **CHK023** — Satisfied by `FR-067`, `FR-099`, `SC-011`, and `SC-029`: keyboard, switch control, screen-reader activation, touch, and supported external input are all inside the accessibility contract.
- **CHK025** — Satisfied by `FR-067`, `FR-069`, `FR-099`, `SC-010`, and `SC-011`: targets cannot overlap and consequential actions require sufficient semantic and physical separation at compact size and enlarged text.
- **CHK029** — Satisfied by `FR-068`, `FR-071`, `FR-099`, `SC-011`, and `SC-029`: Gold and Silver meaning cannot rely on color or material decoration.
- **CHK032, CHK033** — Satisfied by `FR-069`, `FR-099`, `SC-010`, and `SC-029`: 200% text and constrained layouts preserve complete values, consequences, reachable actions, and non-motion state meaning.
- **CHK035** — Satisfied by `FR-078`, `FR-092`, `FR-099`, `SC-028`, and `SC-029`: validation requires an error summary, first-invalid-field focus, plain recovery, and accessible operational-failure handling.

### Superseded wording

- **CHK015** — “reversed” as a holding state is superseded by **Active restored by a reversal event**. `FR-040`, `FR-043`, `FR-067`, `FR-099`, and `SC-030` require the Active state and the reversal event to be exposed distinctly without visual inference.

### Deferred

- **CHK005** — Resolved by the approved content contract, business decisions, and canonical visual handoff; native-Arabic review remains an implementation release check for dynamic pluralization and mixed-direction values.
