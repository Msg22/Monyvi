# SMS Parser Operations

## Production routing

Before routing, batch and live processing hard-exclude messages containing
`اكسب`, `حجز`, `ادفع`, `اتبرع`, `كاش باك`, `موعد`, `كهرباء`, `غاز`, or `مياه`,
even for trusted senders. Arabic diacritics, tatweel, common alef variants, and
repeated whitespace do not bypass the rule. Excluded messages are not
fingerprinted, matched locally, enriched, or sent to the full AI parser. This
deliberately accepts false negatives for legitimate messages that contain an
excluded term.

Production uses the bundled trusted catalog first. Exact, unambiguous active
matches are parsed locally. Trusted rejection templates are discarded locally.
Every unresolved, malformed, unsupported, ambiguous, or disabled template
continues through the existing AI consent gate and full AI parser.

Exact trusted card purchases with a non-empty merchant use the dedicated
`enrich-sms-categories` function. Its request contains only an opaque merchant
ID, the locally extracted merchant, transaction type, and trusted family. The
Edge Function owns the safe system-category allowlist; the caller cannot expand
it. Raw SMS and financial fields never enter this request. The response can
supply only category and confidence. It cannot replace the local merchant or any
financial value.

A category is accepted at confidence `0.50` or greater. Generic fallback
categories such as `other` and `uncategorized` are never accepted. Duplicate
response identities fail closed even when one sibling is malformed. Accepted
category confidence below `0.80` applies the category but keeps a
category-specific review reason. Exact trusted purchases retain local extraction
confidence `0.98`; category-enriched card purchases still require category
confidence at least `0.80`, exactly one resolved account, and zero existing
review reasons before auto-selection. Failed category enrichment, ambiguous
account matches, ATM withdrawals, transfers, refunds, and unresolved templates
remain review-required.

Catalog version 2 also includes one exact `QNB EGYPT` online-banking
transfer-request structure. It remains a low-confidence, review-required
`EXPENSE` suggestion with category `other` and no inferred counterparty. It is
not an internal Transfer record. Near matches continue to full AI parsing.

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

Category-enrichment diagnostics add attempted, accepted, rejected, missing, and
failed counts only. They must not associate a merchant with a returned category.

## Deploy category enrichment

Deploy the dedicated function with:

```powershell
npm run fn:deploy:enrich-sms-categories
```

Local-Supabase mobile launchers also start `supabase functions serve` so newly
added function directories are registered before device testing. A mobile run
started with a `mobile:local-supabase*` command invokes the local Edge runtime,
including through the wireless ngrok tunnel; those requests appear in local
container logs, not in the hosted Supabase dashboard. Use a hosted-Supabase
mobile configuration when remote invocation logs are the intended evidence.

The function requires the same `GEMINI_API_KEY`, Supabase environment, JWT, and
active AI transaction consent as the full SMS parser. A deployment or provider
failure leaves trusted local suggestions available with their fallback category;
it never sends those trusted messages to `parse-sms`.

## Future remote activation

The matcher accepts an activation result and does not own catalog delivery.
`TrustedSmsCatalogProvider` is the replacement boundary for a future signed,
cached remote activation manifest. A future provider must retain the last valid
manifest for offline use and must not change pattern identity, provenance,
matching, or result contracts.
