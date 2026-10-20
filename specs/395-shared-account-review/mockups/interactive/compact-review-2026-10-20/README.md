# Compact Review — interactive v1 (2026-10-20)

**Status:** Owner-approved interactive Voice-first layout/style/responsiveness
and simplified workflow; the corresponding compact React Native frontend and
guarded domain source are **authored and integrated locally by Root**.
Consolidated checks are running; native/manual acceptance, final commit and
deployment are **pending**, not passed or shipped. This runnable interactive
design remains the primary compact UI reference. Earlier R1–R3 image bindings
remain intact. The unapproved compact binding draft is withdrawn; **no second
design approval or sidecar is required**.

## Open and try

Open [`index.html`](index.html) in a browser, or serve that exact file over
local HTTP. Set **320 CSS px** to revisit the owner-tested narrow view; the
width control supports **320–430 px**, text scale **1.00–1.25**, and a
long-account-name toggle. Explore the collapsed/expanded summary and two-line
transcript, inline groups and linked rows, Account needed/Show all, one
currency-labelled account chooser, ready selection, and removed-suggestion
Undo/Discard. This is a simulation: it does **not** save real accounts or
transactions.

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
