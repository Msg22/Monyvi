# Compact Review — interactive v1 (2026-10-20)

**Status:** Owner-approved interactive Voice-first layout, styling and
responsiveness. Implementation is tracked in
[PR #396](https://github.com/Msg22/Monyvi/pull/396). Native/manual acceptance
remains pending; automated checks do not establish rendered fidelity. This
runnable design is the primary compact UI reference. Earlier R1–R3 image
bindings remain intact. The unapproved compact binding draft is withdrawn; **no
second design approval or sidecar is required**.

**2026-10-21 owner override:** The immutable 2026-10-20 interactive HTML still
depicts a fourth Account needed tab. That navigation is superseded: native
review must show exactly **All / Needs review / Selected** (horizontal/RTL
behavior unchanged). Missing-account and currency-blocked rows remain in Needs
review and are resolved via each row's **Choose an account**. Inline linked
previews, accurate counts, selection and Save scope remain approved. Keep all
reference HTML/provenance bytes unchanged; no new binding or approval gate is
needed.

## Open and try

Open [`index.html`](index.html) in a browser, or serve that exact file over
local HTTP. Set **320 CSS px** to revisit the owner-tested narrow view; the
width control supports **320–430 px**, text scale **1.00–1.25**, and a
long-account-name toggle. Explore the collapsed/expanded summary and two-line
transcript, inline groups and linked rows, the historical fourth-tab preview
(superseded by the three native tabs), one currency-labelled account chooser,
ready selection, and removed-suggestion Undo/Discard. This is a simulation: it
does **not** save real accounts or transactions.

## Reference files

- [`index.html`](index.html) — **primary runnable entry**; Git blob
  `e410f2a5495ff4f9f2106e1881d540564ee7c65b`.
- [`source.fragment.html`](source.fragment.html) — exact design
  source/provenance; Git blob `d07aae0eb285bcbd6e53988692cc1cef3e443572`.
- [`standalone-controls.html`](standalone-controls.html) — wrapper control
  prelude; [`reference.json`](reference.json) — retained export/hashes and
  browser evidence.

Keep all four files **byte-for-byte unchanged**. The fragment alone lacks the
wrapper theme/runtime needed for the working browser preview.

## Native adaptations and limits

Native adaptation contract for the locally integrated source: use existing
Monyvi React Native components, **app theme tokens**, measured available
**container** space, system font scaling, 44/48dp accessible touch targets,
EN/AR RTL, existing keyboard/safe-area/footer behavior, and one active overlay.
Group draft name/type/currency now share one guarded final-submit form; the
compact pending checkbox requires explicit group confirmation while protected
legacy callers retain their guarded API. Keep page notices dismissible
immediately below the header **outside scroll**. Browser CSS pixels, iframe,
fake phone/status bar and preview controls are **not** native geometry or app
UI. Icons/tooltips use CDN assets, so the preview is **not guaranteed offline**.
Native device, screenshot fidelity and accessibility checks remain owner-manual
evidence gaps, not new design-approval gates. Voice transfers remain out of
scope; existing SMS ATM/Cash behavior and financial Save logic are unchanged.

## Inline linked transactions

The View/Hide linked-transactions control and read-only preview share the
account title column. Expanding preserves the active tab, main transaction list
and selected rows. One divider separates suggested accounts from their shared
helper notices. Account and category icons, labels and edit controls share a
centered first row; optional account status occupies a separate row.
