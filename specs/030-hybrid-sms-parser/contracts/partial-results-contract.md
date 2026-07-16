# Contract: Partial SMS Results Review

## Visibility

Show the notice only when the SMS review session has at least one reviewable
suggestion and at least one retryable unresolved candidate. Keep it inline below
review controls and above transaction rows. Never overlay or resize the footer.

All AI provider/chunk failures that preserve a partial review session are
retryable from this surface. Consent revocation and cancellation use their
existing flows and do not create the notice.

## Approved presentation

Use both light and dark variants in
`../mockups/partial-results-notice-light-dark.png` as the structural reference:

- compact warning container;
- warning icon;
- title with unresolved count;
- short supporting sentence;
- vertical separator;
- right-aligned retry icon and `Retry N` action.

Use existing Monyvi theme, spacing, type, radius, and icon tokens rather than
copying generated color values.

## Retry behavior

- Retry sends only the unresolved subset.
- While retrying, disable repeated activation and expose an accessible busy
  state without replacing list content.
- Successful retry results merge by fingerprint and preserve edits/selections
  for existing rows.
- Remaining count updates after retry; dismiss the notice at zero.
- Failure keeps prior suggestions and unresolved candidates intact.
- Cancellation restores the pre-retry session without late updates.
- Save, discard, reset, review Back, abandonment route replacement, logout, and
  private-runtime unmount clear unresolved candidates and parse context.

## Accessibility and copy

The whole notice communicates the unresolved count, retry control has an
explicit label, and status does not rely on color alone. User-visible text is
localized and does not expose parser/provider implementation details.
