# US6 Dispose Green evidence

Date: 2026-09-06

Base: `a190d8f`

Branch: `codex/035-metals-dispose`

## Consolidated deterministic Green

Command:

```text
npm test -w @monyvi/mobile -- --runInBand dispose-metal-holding-command-service.test dispose-metal-holding-command-service.rates metals-dispose.test
npm test -w @monyvi/logic -- --runInBand metals-action-payloads rate-reference-contract
```

At this base the focused Dispose and payload-registry suites pass: `3` suites,
`64` tests, `0` failures. The later review-correction added
`useDisposeMetalHolding.test.ts`, so `coverage/us6.md` records the refreshed
`4`-suite / `74`-test mobile run and `2`-suite / `58`-test logic run.

Coverage across the owned service, hook, and screen is `97.48%` statements,
`89.91%` branches, `96.77%` functions, and `98.85%` lines. The terminal command
service is `99.24%` statements, `97.19%` branches, `100%` functions, and
`99.23%` lines.

The Green suite proves exact category IDs and treatments, optional Unicode
notes, no sale/account/ordinary-income/realized-sale effects, atomic local
evidence/lifecycle/state writes, generated-ID validation, active/effective
projection checks, migrated revision-zero completion, idempotent replay,
unsuccessful-root rejection, full-command retry identity, construction cleanup,
safe-area action placement, bounded scrolling, RTL, accessibility, and shared
responsive breakpoints. The review correction also proves acquisition-date
ordering, validation-summary/first-field focus, shaped treatment rendering,
production null-predecessor validation for migrated revision-zero holdings, and
full structural lifecycle reduction with action-root evidence before commit.

## Unclaimed integration evidence

No Maestro Green is claimed. This isolated branch has no shared Dispose route,
current-user holding fixture, or runner-controlled offline mode. EN/AR runtime
resources, process-restart proof, downstream detail/history/reporting, and
physical-device fidelity remain integration/manual gates.
