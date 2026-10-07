# Add Transaction / Voice UI Contract

**Feature**: 389-voice-usage-limits

## Visual authority

The exact already-approved Add Transaction / Voice mockup from the product conversation is the intended visual authority. Do not create a replacement mockup.

Before UI implementation:

1. persist the exact approved image bytes unchanged in `specs/389-voice-usage-limits/mockups/`;
2. create the canonical `.binding.md` sidecar;
3. record only evidenced binding facts and explicit UNKNOWNs;
4. obtain explicit binding-metadata approval;
5. pass `node scripts/verify-mockup-binding.js <sidecar>`.

## Navigation contract

- `/add-transaction` is the unified page.
- missing/invalid `mode` -> Manual.
- FAB Add Transaction -> Manual.
- center microphone -> Voice.
- onboarding Voice entry -> Voice.
- voice-review Retry -> Voice with retry/auto-start intent.

## Mode contract

- Manual renders the current manual transaction form and preserves its submission semantics.
- Voice renders the approved mockup and current voice transaction flow plus authoritative allowance states.
- Manual form state stays mounted across safe switches.
- Mode controls are disabled during active Voice recording/paused/finalizing/analyzing.
- Voice daily exhaustion, burst limit, or entitlement failure never disables Manual.

## Allowance copy contract

- Show the server-authoritative remaining count when numeric.
- Show a distinct exhausted state at zero.
- Do not expose implementation jargon such as "local timezone".
- Do not say "tomorrow at the same time".
- Copy must accurately represent a local-midnight reset, e.g. "Your voice limit resets tomorrow."
- Provide equivalent approved Arabic localization.

## Accessibility and responsive requirements

- Manual/Voice controls expose selected tab state and correct accessibility roles/labels.
- Hidden mode content is removed from the accessibility tree.
- Arabic is RTL-correct; English is LTR-correct.
- The approved composition must be validated in light/dark modes and required enlarged-text/small-screen contexts without silently redesigning it.
