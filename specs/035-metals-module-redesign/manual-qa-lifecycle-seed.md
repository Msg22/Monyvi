# Metals manual-QA lifecycle seed

This fixture is for deterministic local manual QA of Metals History/detail terminal rows. It does not replace device or rendered QA evidence.

## Local setup

From the repository root, reset local Supabase and seed the manual-QA account:

```bash
npm run local:reset-and-seed
```

The underlying mobile seed command is:

```bash
npm run manual:seed-user -w @monyvi/mobile
```

Use the local auth account `manual-qa@monyvi.test`. The default local password is `123456`; `MANUAL_QA_PASSWORD` may be supplied to replace it for the seed run. Re-running the seed is deterministic and upserts the same fixture identities. Use `npm run manual:reset-user -w @monyvi/mobile` to remove the scoped fixture rows.

## Expected Metals rows

The existing active fixtures remain available:

- `21k Gold Chain` — Active Gold.
- `Silver Coin Stack` — Active Silver.
- `Gold Test Bar` — Active Gold.

History/detail also has two terminal fixtures:

- `QA Sold Gold Coin` — `Sold`; a whole-holding `metals.sell/v2` event in EGP with gross proceeds `EGP 36,000.00`, fee `EGP 500.00`, and net proceeds `EGP 35,500.00`. The action has empty account guards and no account-credit effect, so it does not depend on issue #242.
- `QA Given Away Silver Bar` — `Disposed`; a `metals.dispose/v1` event using the approved `given_away` category and a manual-QA note. The payload contains no sale proceeds and no realized-sale P/L fields.

Both terminal rows have deterministic financial-action, action-evidence, lifecycle-event, and holding-state provenance with holding revision `1`. Seed inspect/reset covers those lifecycle rows as part of the same manual-QA scope.

## Limitations

- This seed supplies deterministic persistence data only; it does not claim that navigation, layout, accessibility, or visual fidelity has been exercised on a physical device.
- The Sold fixture intentionally has no account credit. Account-credit effects remain owned by issue #242 / the later account-integrity work.
- The fixture does not simulate sync conflicts, stale revisions, Undo, Delete, or cross-currency terminal rate snapshots.
- Market-rate import remains best-effort through the existing manual seed command and is independent of these terminal lifecycle facts.
