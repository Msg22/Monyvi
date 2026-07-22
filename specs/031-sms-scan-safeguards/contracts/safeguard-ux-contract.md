# Contract: SMS Safeguard UX

## Approval Artifacts

Mohamed approved the following focused boards on 2026-07-20. They are normative
for hierarchy, state communication, and interaction behavior; implementation
must use the existing Monyvi theme tokens rather than sampling literal colors
from the generated images:

- `../mockups/sms-scan-settings-safeguards-light-dark.png`
- `../mockups/sms-scan-scope-partial-results-light-dark.png`
- `../mockups/sms-safeguard-qa-diagnostics-dark.png`

## Scope

Focused additions only. Preserve the current settings, scan progress, and
transaction-review information architecture and Monyvi light/dark tokens.

## SMS Sync Settings

- Primary row/action remains `Sync new SMS`.
- Supporting copy states that ordinary scanning checks new messages and that
  launch history is limited to the recent 30 days.
- A separate `Rescan recent messages` action rereads the rolling 30-day window.
- During cooldown, keep rescan visible but disabled and show a localized
  absolute availability date/time below it.
- Do not show plan names, upgrade copy, paywalls, custom ranges, or a live
  countdown.

## Scan Progress/Result

- Scope copy communicates `Last 30 days` without technical quota language.
- Local work may continue when AI capacity is unavailable.
- Oversized/quota/cooldown states use aggregate counts only and never reveal raw
  message content in the notice.

## Review Partial-Results Notice

- Reuse the existing inline notice location below review controls and above the
  list.
- Preserve successful suggestions and keep Save enabled.
- State that some messages could not be processed and can be tried in a later
  permitted sync.
- When useful, show one localized absolute availability time.
- Do not add a mandatory decision, modal, continue-without button, raw retry
  queue, or persistent draft promise.

## Quality Requirements

- Light and dark theme compatible using existing tokens.
- English and Arabic layout/copy supported.
- Android status/navigation safe areas applied once.
- No overlap with sticky header/footer or transaction list.
- Disabled actions remain legible and expose accessibility state/reason.
- Focused mockup approval is mandatory before implementation.

## Development-Only QA Diagnostics

- The approved compact `QA ONLY` panel appears only for an explicit, non-release
  safeguard QA profile using the fixture inbox and simulated provider.
- It is collapsed by default and identifies the profile/version, purpose,
  aggregate result counts, active limits, and any reached boundary.
- It never renders raw SMS content, sender data, fingerprints, template IDs,
  request keys, or user information.
- Production and ordinary development SMS scans render no QA panel.
