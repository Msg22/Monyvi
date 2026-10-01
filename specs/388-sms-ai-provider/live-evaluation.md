# Live SMS Provider Evaluation

EVAL-001 is a report-only evaluator for the deployed `parse-sms` path. It uses
synthetic SMS only and never reads a device inbox or saves returned synthetic
transactions.

The canonical provider list comes from
`packages/logic/src/parsers/egyptian-bank-registry.ts`. The evaluator derives
all currently selectable banks and wallets at run time; it does not hardcode a
provider count.

## What the evaluator measures

Each selectable provider receives at least one clearly completed transaction and
one clear non-transaction. Additional independent synthetic templates cover
sender aliases, Arabic and English, Arabic numerals/separators, foreign currency,
refunds, ATM withdrawals, card-versus-account suffixes, generic payment-gateway
ambiguity, pending/failed transactions, OTP/promotions, semantic duplicates and
holdout wording.

Every case records:

- visible run/case ID;
- provider and synthetic sender/body;
- synthetic provenance and holdout/template tags;
- received date and canonical SMS fingerprint;
- expected transaction presence;
- only objectively supportable field labels; and
- accepted alternatives or `unknown` where category/counterparty purpose is
  not provable from the SMS.

Synthetic templates are not represented as authentic bank/wallet wording.

The final deployed-path response is scored by `messageId`. Final end-to-end
accuracy may include cases that the Edge Function handled locally before provider
execution. Raw model accuracy never does: only cases proven present in the
actual provider-input diagnostic event can enter raw-model denominators.

Duplicate or unknown output identities are reported as excess output and reduce
precision without creating additional true positives or field denominators.
Transport failures, admission failures, malformed responses, unresolved
candidates, terminal/suppressed candidates and unattempted cases remain separate
classifications rather than semantic passes or misses.

A confidence range attached to the generic-gateway ambiguity case is explicitly
a product-policy heuristic, not a calibrated probability and not an objective
accuracy field.

## Dry run — default

Dry-run makes zero HTTP requests and requires no credentials.

~~~powershell
npm run sms:provider:evaluate
~~~

For a repeatable named run:

~~~powershell
npm run sms:provider:evaluate -- --run-id eval-2026-10-01-a --anchor-ms 1790874000000
~~~

The JSON report exposes every selected case plus aggregate, provider, scenario,
classification, batch, provenance, latency and raw-observation coverage. It also
includes a `rawAttributionManifest` containing each original request batch ID,
requested case list and request-input digest.

A dry run can be bounded explicitly:

~~~powershell
npm run sms:provider:evaluate -- --run-id eval-dry --max-cases 20 --max-requests 4
~~~

`maxRequests` does not cause dry-run network calls; it is retained so the same
run shape can be prepared before live execution.

## Live staging run

Live mode is deliberately pinned to development project
`yulbcndyssdjicbpmlrk` and exactly:

~~~text
https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms
~~~

The guard rejects HTTP, alternate hosts/projects, credentials embedded in the
URL, query strings, fragments, alternate paths and redirects.

Use only the dedicated staging test account. Supply its authenticated user token
through process memory/environment, never a command-line argument or committed
file:

~~~powershell
$env:SMS_PROVIDER_EVAL_ACCESS_TOKEN="<dedicated staging user JWT>"
~~~

If the Supabase gateway requires the public project key, supply it separately:

~~~powershell
$env:SMS_PROVIDER_EVAL_PUBLIC_API_KEY="<public staging anon key>"
~~~

Both live bounds are mandatory:

~~~powershell
npm run sms:provider:evaluate -- --live --run-id eval-live-001 --max-cases 20 --max-requests 4 --output eval-live-001.json
~~~

The evaluator sends at most five synthetic messages per request and performs
requests sequentially. It does not retry failed live calls. Expected labels,
holdout tags and provenance are never sent to the model.

The normal server contract remains authoritative. Active AI consent, scan
window, quota, burst, reservation, cooldown, fingerprint and replay rules all
apply. The evaluator does not reset or bypass them. Auth/consent/capacity
refusals stop later live batches. Other failures and cancellation preserve the
partial report and leave remaining selected cases unattempted.

The executable CLI registers `SIGINT` and `SIGTERM`, forwards an
`AbortSignal` to the pending request, and writes the partial report before
returning.

A new run anchor produces new synthetic received timestamps and therefore new
canonical fingerprints. This is a fresh synthetic run, not a request-key bypass
of same-message replay.

## Report-only boundary

The script never invokes a transaction-save/mobile persistence path, so returned
synthetic transactions are not written as user financial records.

The real `parse-sms` Edge Function may still write its normal safeguard,
reservation, provider-start, negative-outcome or other operational accounting
metadata. Report-only does **not** mean zero backend bookkeeping.

## Raw DeepSeek output versus final output

The normal HTTP response is the grounded/validated final layer. It must never be
presented as raw model accuracy.

Raw model scoring requires two independently attributable pieces of existing
development diagnostic evidence:

1. `smsAi.providerRequestInput`, which contains only the actual submitted
   `sender`, `body` and `date` values after Edge prefiltering; and
2. `smsAi.providerResponseOutput`, containing the returned assistant content.

The evaluator does not scrape Supabase logs and does not require a second
provider run.

Provider-input messages are correlated back to source cases by recomputing the
canonical fingerprint from `sender`, `body` and `date`. The original
request-input digest remains separate from the filtered provider-input identity.
Unknown or duplicate actual provider inputs are rejected.

A raw response batch does **not** imply that all cases from the original request
reached DeepSeek. Cases filtered by the Edge Function remain `not_observed` in
raw-model scoring. A raw `transactions: []` response is semantically empty only
for cases proven present in that actual provider-input batch.

After a live run:

1. Save the final report with `--output`.
2. Use the report's `rawAttributionManifest` to identify the original request.
3. Build one local provider-input evidence file from the existing
   `smsAi.providerRequestInput` log event.
4. Build one local raw-output evidence file from the matching
   `smsAi.providerResponseOutput` event.
5. Omit any batch that cannot be attributed confidently. Never guess.
6. Attach both evidence files to the saved report offline:

~~~powershell
npm run sms:provider:evaluate -- --final-report eval-live-001.json --provider-input-observations eval-live-001-provider-input.json --raw-observations eval-live-001-raw.json --output eval-live-001-with-raw.json
~~~

Provider-input evidence shape:

~~~json
{
  "runId": "eval-live-001",
  "batches": [
    {
      "runId": "eval-live-001",
      "batchId": "batch-001",
      "requestInputIdentity": "<copy from rawAttributionManifest>",
      "smsMessages": [
        {
          "sender": "qnb",
          "body": "synthetic message body",
          "date": "2026-10-01T16:00:00.000Z"
        }
      ]
    }
  ]
}
~~~

Raw-output evidence shape:

~~~json
{
  "runId": "eval-live-001",
  "batches": [
    {
      "runId": "eval-live-001",
      "batchId": "batch-001",
      "caseIds": ["<original requested case IDs for this batch>"],
      "inputIdentity": "<copy from rawAttributionManifest>",
      "responseContent": "{\"transactions\":[]}"
    }
  ]
}
~~~

Raw wire transactions remain model evidence even when a field would later be
rejected or grounded by Monyvi. Raw and final aggregates are therefore reported
separately. Missing provider-input evidence or missing raw output remains
`not_observed`.

A replayed final response does not by itself prove that a fresh provider request
occurred. Provider-call provenance remains `unknown` unless correlated
evidence establishes a provider call.

## Deterministic verification and CI

All automated evaluator tests use synthetic data and injected/mock HTTP
transport. They consume zero live provider allowance.

Focused command:

~~~powershell
npm run test:sms-provider-live-evaluator
~~~

The repository CI already executes `npm run test:scripts`; `test:scripts`
now chains `npm run test:sms-provider-live-evaluator`, so the evaluator's
mocked suite runs in CI without changing the workflow file.

No app UI is changed, so Maestro app E2E is not applicable.

## Coverage matrix

| Area | Deterministic mocked coverage | Live/manual evidence |
| --- | --- | --- |
| Registry corpus | Dynamic selectable-provider positive/negative floor, aliases, independent edge/holdout templates | None required |
| Fingerprints/dates | Canonical Edge fingerprint helper; stable within-run anchor; fresh-anchor identity change | Staging safeguard acceptance |
| HTTP boundary | Exact staging HTTPS target; no URL credentials/query/fragment/other host/path; redirect refusal | Dedicated staging test account |
| Credentials | Environment-only user JWT; optional public key; report/error redaction | Operator supplies staging values |
| Batching | Five messages, sequential, explicit max cases/requests, no automatic retry | Normal hosted limits |
| Admission/replay | Mocked auth/consent/capacity stop; unresolved/terminal/unattempted classification | Actual staging consent/quota/cooldown/replay |
| Final accuracy | Message-ID detection and field metrics; excess-output precision penalty; category alternatives/unknowns | Deployed grounded/validated response |
| Provider-input proof | Canonical fingerprint correlation; unknown/duplicate rejection; prefiltered cases excluded from raw denominators | Existing development provider-input log |
| Raw accuracy | Independent raw aggregate; partial coverage; attributed raw empty output | Existing development response-output log |
| Saved report import | Strict external schema plus case/batch/manifest identity checks and JSON roundtrip | Offline attachment without rerun |
| Invalid output | Non-JSON/malformed 200 and invalid transaction fields are response-invalid | Only naturally occurring hosted failures |
| Cancellation/failures | Signal abort forwarded to pending fetch; partial report persisted | Manual cancellation if needed |
| Cache/usage | Report fields only when evidence is actually available | Existing hosted telemetry/log inspection; no invented cache claim |
| Persistence | No financial transaction save path in evaluator | Normal Edge accounting metadata may still be written |
