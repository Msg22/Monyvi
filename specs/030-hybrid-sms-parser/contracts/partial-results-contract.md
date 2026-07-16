# Contract: Partial SMS Results Review

## Visibility

Show the notice only when the SMS review session has at least one reviewable
suggestion and at least one unresolved candidate. Keep it inline below review
controls and above transaction rows. Never overlay or resize the footer.

Retryable AI provider/chunk failures expose retry from this surface. A mixed
retry that preserves successful results and leaves only non-retryable failures
keeps the notice without an action. Consent revocation and cancellation use
their existing flows and do not create the notice.

## Approved presentation

Use both light and dark variants in
`../mockups/partial-results-notice-light-dark.png` as the structural reference:

- compact warning container;
- warning icon;
- title with unresolved count;
- short supporting sentence;
- vertical separator;
- right-aligned retry icon and `Retry N` action.

When no unresolved candidate is retryable, omit the separator and retry action.
Keep the warning title, explain that the other suggestions are ready and the
remaining messages can be attempted in a later sync, and leave Save enabled.

Use existing Monyvi theme, spacing, type, radius, and icon tokens rather than
copying generated color values.

## Retry behavior

- Retry sends only the unresolved subset.
- While retrying, disable repeated activation and expose an accessible busy
  state without replacing list content.
- Successful retry results merge by fingerprint and preserve edits/selections
  for existing rows.
- A non-retryable mixed result still commits its successful suggestions to the
  in-memory review session; it does not require acknowledgment before Save.
- Remaining count updates after retry; dismiss the notice at zero.
- Failure keeps prior suggestions and unresolved candidates intact.
- Saving while non-retryable candidates remain does not advance the incremental
  SMS checkpoint. Saved suggestions deduplicate by fingerprint on the later
  scan, while failed messages remain eligible without persisting their raw body.
- Cancellation restores the pre-retry session without late updates.
- Save, discard, reset, review Back, abandonment route replacement, logout, and
  private-runtime unmount clear unresolved candidates and parse context.

## Accessibility and copy

The whole notice communicates the unresolved count, retry control has an
explicit label, and status does not rely on color alone. User-visible text is
localized and does not expose parser/provider implementation details.
