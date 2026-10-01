# Live SMS Provider Evaluation

EVAL-001 is report-only evaluation infrastructure for the deployed `parse-sms` path.

This file is intentionally a RED-stage manual-plan scaffold. The evaluator implementation is not yet present.

## Planned manual live boundary

- Dry-run is the default and performs no network requests.
- Live mode requires explicit opt-in, bounded case/request limits, the dedicated staging user session, and the fixed development project `yulbcndyssdjicbpmlrk`.
- The only permitted live target is the HTTPS `parse-sms` Edge Function for that project.
- User access token and optional public API key are supplied through process environment only and must never appear in reports or errors.
- Calls remain sequential, default to five synthetic messages per request, and use normal auth, consent, admission, quota, cooldown, fingerprint, and replay safeguards.
- The evaluator does not save returned synthetic transactions. Existing server safeguard/accounting metadata may still be written by the normal Edge Function.
- Expected labels stay local to the evaluator and are never included in outbound HTTP payloads.

## Planned raw/final attribution

The HTTP response is scored as the grounded/validated final layer. Raw DeepSeek output is separate optional manual evidence from existing development logs. Raw evidence must match run, batch, case list, and input identity; otherwise that batch remains `not_observed`. Partial raw coverage and valid raw `transactions: []` remain explicit.

## Planned coverage matrix

| Area | Deterministic mocked coverage | Live/manual evidence |
| --- | --- | --- |
| Registry corpus | Every selectable provider, positive/negative floor, aliases, edge scenarios, independent holdout | None required |
| Fingerprints/dates | Canonical Edge fingerprint helper, stable run anchor | Normal staging safeguard acceptance |
| HTTP safety | Fixed staging target, no redirects, secrets omitted, bounded sequential requests | Dedicated staging account only |
| Admission/replay | Classification and stop behavior mocked | Real consent/quota/cooldown/replay behavior |
| Accuracy | messageId scorer, field denominators, unknown category semantics | Deployed final response |
| Raw output | Attribution/import validation mocked | Optional existing debug logs; no automated scraping |
| Failures | timeout/transport/malformed/empty classifications mocked | Only naturally occurring staging failures |
| App E2E | Not applicable; no app UI change | No Maestro requirement |
