# AI Processing Privacy Notes

Last reviewed: 2026-07-04

This document records the current Monyvi AI-processing data flow and the privacy
assumptions that must stay aligned with product copy, store disclosures, and
issue #284.

## Current Provider

- Monyvi uses Google Gemini through Supabase Edge Functions for SMS parsing and
  voice parsing.
- Short in-app copy may say "our AI provider", but detailed privacy surfaces
  should name Google Gemini.

## Current Payloads

SMS import and live SMS detection:

- The app filters on-device first and sends only candidate financial SMS
  messages, not the full inbox.
- The Gemini payload includes the matching SMS body, sender/provider, date, and
  a message ID used to map the response back to the in-memory candidate.
- Transaction and transfer records persist `smsFingerprint` for deduplication,
  not the raw SMS body.
- Local notification payloads must not include `rawSmsBody`.

Voice entry:

- The app sends the voice recording to Gemini for transcription and parsing.
- The payload includes account names for matching because this materially
  improves account selection quality.
- Account names should be treated as personal data because users may create
  sensitive labels.

## Gemini Retention Assumptions

Use careful language until the exact API billing and zero-data-retention status
are verified for the production project.

Based on Google's official Gemini API zero-data-retention documentation reviewed
on 2026-07-04:

- For Gemini API Paid Services, Google says prompts and responses are not used
  to improve Google products.
- Google may retain prompts and responses for a limited period for abuse
  monitoring unless a project has approved zero data retention.
- Zero data retention for the Gemini Developer API is project-specific and must
  be requested/approved.
- Grounding with Google Search or Maps has separate 30-day retention behavior
  and should not be enabled for these flows without a new privacy review.
- Interactions API state storage must be explicitly disabled with `store: false`
  if that API is introduced later.
- The current Monyvi Edge Functions use `generateContent` and do not configure
  grounding, Interactions API state, or explicit context caching.

References:

- https://ai.google.dev/gemini-api/docs/zdr
- https://ai.google.dev/gemini-api/terms
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention

## Product Copy Guardrails

- Do not say "never stored" unless the production Gemini project has confirmed
  zero-data-retention approval and the app avoids features with separate
  retention behavior.
- Do not say "not used for training" unless the production project is on Gemini
  API Paid Services or another verified contract with the same restriction.
- Prefer: "sent securely to our AI provider so Monyvi can suggest transactions
  for you to review."

## Follow-Up Decisions

- Confirm whether the production Gemini project is a Paid Service.
- Decide whether to request Gemini Developer API zero data retention before
  release.
- Keep sender/provider and account names in payloads for now because removing
  them would reduce parsing and matching quality.
- Revisit temporary SMS IDs and local/hybrid voice account matching only after
  the consent UX ships.
