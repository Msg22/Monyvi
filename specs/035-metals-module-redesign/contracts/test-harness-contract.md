# Deterministic Test Harness Contract

Inject fixed clock/UUIDs/hash, catalog version, exact rates, owned/foreign holdings,
default/mismatched accounts, and controllable RPC outcomes. Controls reset SQLite and
server fixtures; seed fresh/stale/unknown/missing rates; pause before RPC; order device
A/B actions; return acceptance, replay, stale revisions, hash mismatch, ownership,
holding-only stale, account-only stale, both-resource stale, partial group, network
failure, or missing/mismatched per-resource canonical evidence; restart at every state;
and inspect holdings, balance/revisions, evidence, History, net worth, and watermark.

Required proofs: local all-or-none; one winner; idempotent replay; one exact
compensation; hash mismatch and foreign owner mutate nothing; stale/missing rates
preserve holdings; metadata never bypasses CAS; failures advance no watermark; sale
effects never count as ordinary income; Decimal.js/PostgreSQL parity. Maestro consumes
fixtures; real two-device, physical offline, assistive technology, and tablet/
landscape remain explicit manual evidence.

Account-only stale fixtures prove the RPC carries a null holding-winner ID plus the
verified pre-action holding revision/hash, independently carries account winner
identity/revision/hash, restores the holding without inventing a winner event, and
removes the losing local account effect exactly once. Missing or swapped resource
hashes, revision/action mismatches, and unrelated unverified local account effects must
leave recovery locked and write no partial compensation.

Migration/cutover fixtures MUST cover account revision-0 backfill without fabricated
actions; guarded transaction/transfer/recurring/SMS/debt/account writers; legacy clients
that lack action ID/hash/expected revision; drained, migrated, and quarantined unsynced
rows; protected balance/revision columns under generic sync; Gold and Silver exact-field
backfill; unique and unmatched purity; missing/invalid compatibility values; existing
exact values; retained compatibility columns; and an identical second migration run.

List profiling uses deterministic sets of 20/100/500 holdings and 100/300/1,500 History
events on viewport profiles for centralized compact-phone, ordinary-phone, and tablet
breakpoints. Record viewport, OS, build, and renderer. After 5 seconds warm-up, capture
the longer of 30 seconds or five top-to-bottom-to-top passes, three times, recording
median and worst React Profiler/platform-frame evidence. The 100/300 set permits at most
5% slow frames and zero frozen frames over 700 ms; the 500/1,500 stress set permits at
most 10%, zero frozen frames, no blank cells/crash, and no whole-list rerender for a
row-only update.
