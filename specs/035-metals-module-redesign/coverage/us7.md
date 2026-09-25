# US7 Delete Coverage

Integrated base: `e12d56b0` (`origin/main` after PR #292).

Scope: T112–T119 Active-only mistaken-record Delete. Shared adapter/registry
and fixture registry remain integration-owned. The Delete Expo route and the
detail Delete action composition are PR276-live (unit/journey Green); offline
harness control, terminal fixtures, and device gates remain open.

Current implementation head:
`8720ce7cee3872c1be4e5a910c3d846b7c0a7a9e`. Hosted Code Quality & Tests,
Financial Action pgTAP, and Android Build Verification passed. The hosted mobile
step reports 423 suites / 3,722 tests; Android E2E was skipped. The current
Delete route suite contains 15 passing cases in that hosted run. No new local
verification is claimed by this documentation update.

| Scenario | Requirement / criterion | Service integration | UI/hook | E2E | Status |
| --- | --- | --- | --- | --- | --- |
| Effective Active-only grouped Delete | FR-037–040, FR-087, SC-003–004 | SQLite Green | Hook/sheet Green | Route live (unit/journey Green); device + fixtures open | Route + composition Green |
| Predecessor-less revision-zero migrated Active Delete | Data model revision-zero migration contract, FR-077–080 | SQLite Green via real shared `DEFAULT_FINANCIAL_ACTION_REGISTRY` | N/A | Route live; fixtures pending | Service + route Green; integration open |
| Hidden non-effective audit and no reappearance | FR-037, FR-040, FR-079, SC-007, SC-030 | SQLite Green | Consequence Green | Restart sequence only; fixtures pending | Route Green; runtime open |
| Zero sale/disposal/proceeds/P&L/write-off/transfer/account effect | FR-037, FR-091, SC-023 | SQLite Green | Destructive semantics Green | Authored visible proof | Isolated Green |
| Sold/Disposed/non-effective rejection | FR-038, FR-087 | SQLite Green | Descriptor boundary Green | Delete hidden by composition and deep-link gate (unit Green); terminal fixtures blocked | Service + composition + route gate Green; runtime open |
| Replay, hash mismatch, duplicate lock | FR-076–077, FR-080, SC-015 | SQLite Green | Hook/sheet Green | Double-tap authored; conflict rebuild + same-ID replay covered in hook/route journeys | Route Green; runtime open |
| Atomic rollback and retry | FR-039, FR-078, FR-089–090 | SQLite Green | Hook/sheet Green | Authored; token-ensure confirm/retry + load-error retry covered in route journey | Route Green; runtime open |
| User scope and offline/restart persistence | FR-060–064, SC-003 | SQLite Green | Offline copy Green | Offline control missing; restart sequence blocked | Isolated Green; runtime open |
| Approved focused Screen 14 facts and copy | FR-092, FR-102 | N/A | Sheet Green | Authored against the live route; fixtures pending | Route Green; device gate open |
| Safe area, RTL/theme, compact/ordinary/tablet/200% reflow | FR-065–071, SC-010–013 | N/A | Contract Green | Manual device proof | Isolated Green; device gate open |
| Rejected Delete restores Active timeline and original action identity | FR-079–080, FR-088–089 | SQLite rejection/restart Green | N/A | Multi-device QA open | Service Green; runtime open |
| Stale/unknown metal and FX inputs in Delete review | FR-055, FR-074–075 | Separate trust inputs Green | Per-input warnings and acknowledgment Green | Device QA open | UI Green; device gate open |
| Reconciliation lock and explicit success | FR-078, FR-089, FR-092 | N/A | Route recovery and success toast Green | Assistive QA open | Route Green; device gate open |

## Activation and verification status

- Current hosted evidence supersedes the earlier 2-suite/32-test checkpoint:
  the mobile step passes 423 suites / 3,722 tests and includes the Delete route,
  sheet, presentation, hook, command integration, concurrency, architecture,
  and reconciliation regressions. The route suite now has 15 cases, including
  success feedback and reconciliation lock.
- T115 is partial and not run. Its Active/restart sequence is authored against
  the now-live Delete route, but offline establishment and terminal assertions
  are missing. It cannot execute honestly without deterministic fixtures,
  offline harness control, and shared integration.
- T118 route and composition work is Green: the holding-scoped Delete route,
  the `useDeleteHoldingCommand` facade, the delete-only detail composition,
  and the runtime-wired `delete.*` copy are covered by unit/journey tests.
  Follow-up review findings are addressed on this branch: revision-conflict
  retry rebuilds with fresh identity while uncertain commits preserve same-ID
  replay; root/evidence/event IDs have parity; predicted canonical revision is
  not stored before acceptance; prior lifecycle actions are not dirtied; Delete
  compensation restores predecessor effective/history flags; incomplete
  reconciliation locks the route; success is shown/announced and uses
  `dismissTo("/metals")`; and Mohamed-approved per-input stale/unknown rate
  warnings require acknowledgment before Delete.
  Maestro execution, device fidelity, and fixture-gated terminal proof remain
  with T115/T119.
- T119 remains partial pending Maestro, device fidelity, real assistive
  technology, and shared integration gates.
- The Maestro file is a partial blocked contract, not completed E2E coverage.
  It lacks offline establishment and terminal-state assertions because no owned
  shared harness control or terminal fixture exists; the live route it opens
  is present on this branch.
- The isolated command still injects its envelope creator, but that creator and
  the commit path now resolve `metals.delete/v1` from the real shared
  `DEFAULT_FINANCIAL_ACTION_REGISTRY`. The current main base accepts
  predecessor-less revision-zero (`legacyRoot`) Delete envelopes, so the
  legacy-base test-only registry shim was removed and revision-zero behavior is
  verified against the shared registry end to end. Evidence:
  `apps/mobile/__tests__/services/delete-metal-holding-command-service.integration.test.ts`
  — "deletes a predecessor-less revision-zero migrated Active holding without
  fabricating prior lifecycle evidence" passes through both envelope
  canonicalization and `commitFinancialActionGroupLocally` validation in the
  current hosted mobile run. The earlier 17/17 focused count predates the seven
  review-fix regressions and is not reused as current-head evidence. The
  shared-registry integration gate is closed; Maestro T115 offline/terminal
  proof and device gates remain open integration work. This lane added the
  Delete route, the delete-only detail composition, the command facade hook,
  the concurrency-token service, the sheet presentation helper, `delete.*`
  en/ar copy (including the approved `terminal_unavailable` gate line), and
  the shared `DELETE_REVISION_CONFLICT_CODE` export on the lane-owned command
  service. No shared adapter, registry, fixture, barrel, schema, sync,
  Sell, Dispose, or Undo file changed.
- No device or E2E completion is claimed; Android E2E was skipped in the current hosted workflow.
