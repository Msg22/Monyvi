# Slice 3A Generic Financial-Action Foundation — Red Evidence

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Working directory: `E:/Work/My Projects/Monyvi-metals-financial-actions`
Owner: Generic-foundation owner
Base: approved local Metals foundation

## Logic contract

Command:

```text
node node_modules/jest/bin/jest.js --config E:/Work/My Projects/Monyvi-metals-financial-actions/packages/logic/jest.config.js --runInBand E:/Work/My Projects/Monyvi-metals-financial-actions/packages/logic/src/financial-actions/__tests__/action-contracts.test.ts --watchman=false --cacheDirectory E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals-3a
```

Result: intended Red. One suite failed before test execution because
`../action-contracts` did not exist. This proves canonical-envelope validation,
serialization, injected UTF-8 SHA-256 hashing, replay, and durable-state behavior
had no production implementation.

## Local storage and generic-sync boundary

Command:

```text
node node_modules/jest/bin/jest.js --config E:/Work/My Projects/Monyvi-metals-financial-actions/apps/mobile/jest.config.js --runInBand E:/Work/My Projects/Monyvi-metals-financial-actions/apps/mobile/__tests__/services/financial-action-foundation.integration.test.ts E:/Work/My Projects/Monyvi-metals-financial-actions/apps/mobile/__tests__/services/sync/financial-action-generic-sync-exclusion.test.ts --watchman=false --cacheDirectory E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals-3a
```

Result: intended Red. Repository suite failed because
`financial-action-foundation-repository` did not exist. Sync suite ran four tests:
two generator-inclusion assertions passed, while two intended assertions failed
because `DEDICATED_SYNC_TABLES` and generated `FinancialActionGroup` registration
did not exist. No account/balance behavior was assumed.

## PostgreSQL contract

Test artifact:
`supabase/tests/financial_action_canonicalization_test.sql` contains 11 pgTAP
assertions covering the table/function, Arabic vector and digest parity, canonical
raw-text equality, reordered keys, alternate escapes, JSON numbers, duplicate keys,
hash constraints, nullable account revision, RLS, and owner/action identity.
Executable Node `crypto` and Web Crypto verification established the exact 32-byte
UTF-8 SHA-256 fixture as
`d9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab`;
the earlier provisional contract text omitted the leading `d` and contained only
63 hexadecimal characters.

Harness preflight:

```text
npx supabase --workdir E:/Work/My Projects/Monyvi-metals-financial-actions status --output json
```

Result: infrastructure-blocked, not counted as Red. Docker Desktop's Linux engine
pipe was unavailable: `open //./pipe/dockerDesktopLinuxEngine: The system cannot
find the file specified.` No migration was applied. Run the pgTAP suite after local
Supabase becomes available; until then SQL Green cannot be claimed.

## Gate

Logic and local-storage production work may begin from intended Red. SQL migration
may be authored and statically checked, but T020/T022/T024 stay incomplete until
the local SQL harness runs against migration `067`.
