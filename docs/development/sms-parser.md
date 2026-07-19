# SMS Parser Operations

## Production routing

Production uses the bundled trusted catalog first. Exact, unambiguous active
matches are parsed locally and remain review-only. Trusted rejection templates
are discarded locally. Every unresolved, malformed, unsupported, ambiguous, or
disabled template continues through the existing AI consent gate and AI parser.

Fixture and development-local parser modes are separate from this production
policy. They must not be used as evidence that a template is production-trusted.

## Deterministic hybrid E2E

Use `npm run mobile:e2e-hybrid-fixture` to start Metro, then run
`npm run e2e:sms-sync:hybrid-fixture` in another terminal. This E2E-only mode
keeps the production trusted matcher and hybrid partition intact while replacing
the device inbox and AI provider with deterministic fixtures. It is rejected
outside explicit non-production E2E mode and must never be used as a normal
development or production parser setting.

## Promote and validate

1. Add an explicit approved record to the promotion manifest.
2. Run `npm run qa-sms:promote-trusted`.
3. Run `npm run qa-sms:validate-trusted`.
4. Run `npm run qa-sms:privacy-check`.
5. Run `npm run qa-sms:benchmark-trusted`.

Promotion is deterministic and does not modify candidate evidence. Production
runtime code may import only the generated trusted catalog, never intake
candidates, evaluator output, or concrete private values.

## Disable and roll back

- Add a pattern's stable ID to `TRUSTED_SMS_DISABLED_PATTERN_IDS` in
  `trusted-sms-patterns/promotion-manifest.ts`, regenerate and validate the
  catalog through the promotion flow, and ship the catalog update. That pattern
  falls back to AI while unrelated patterns remain active. Remove the ID and
  regenerate to re-enable the same reviewed pattern.
- Set `EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED=false` for a staged build to route
  all candidates through the existing AI parser.
- For an OTA problem, roll back to the last valid Expo update. Expo activation
  keeps the prior installed update when a new update cannot activate. Runtime
  catalog validation adds another fail-closed boundary: an invalid current
  catalog activates no local patterns and candidates fall back to AI.

## Diagnostics

Allowed diagnostics contain counts, stable reason codes, parser mode, catalog
version, runtime scopes, and pattern IDs. They must never contain SMS text,
sender, amount, balance, account/card data, merchant/person, reference, phone,
date/time values, transcript, or an AI response body.

## Future remote activation

The matcher accepts an activation result and does not own catalog delivery.
`TrustedSmsCatalogProvider` is the replacement boundary for a future signed,
cached remote activation manifest. A future provider must retain the last valid
manifest for offline use and must not change pattern identity, provenance,
matching, or result contracts.
