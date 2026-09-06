# US7 Delete Coverage

Stable base: `a190d8f`.

Scope: T112–T119 Active-only mistaken-record Delete. Shared adapter/registry,
locales, fixture registry, detail composition, and live route activation remain
integration-owned.

| Scenario | Requirement / criterion | Service integration | UI/hook | E2E | Status |
| --- | --- | --- | --- | --- | --- |
| Effective Active-only grouped Delete | FR-037–040, FR-087, SC-003–004 | SQLite Green | Hook/sheet Green | Authored, blocked | Isolated Green |
| Hidden non-effective audit and no reappearance | FR-037, FR-040, FR-079, SC-007, SC-030 | SQLite Green | Consequence Green | Authored restart path | Isolated Green |
| Zero sale/disposal/proceeds/P&L/write-off/transfer/account effect | FR-037, FR-091, SC-023 | SQLite Green | Destructive semantics Green | Authored visible proof | Isolated Green |
| Sold/Disposed/non-effective rejection | FR-038, FR-087 | SQLite Green | Descriptor boundary Green | Authored terminal path | Isolated Green; runtime open |
| Replay, hash mismatch, duplicate lock | FR-076–077, FR-080, SC-015 | SQLite Green | Hook/sheet Green | Double-tap authored | Isolated Green |
| Atomic rollback and retry | FR-039, FR-078, FR-089–090 | SQLite Green | Hook/sheet Green | Authored | Isolated Green |
| User scope and offline/restart persistence | FR-060–064, SC-003 | SQLite Green | Offline copy Green | Authored | Isolated Green; runtime open |
| Approved focused Screen 14 facts and copy | FR-092, FR-102 | N/A | Sheet Green | Authored | Isolated Green; device gate open |
| Safe area, RTL/theme, compact/ordinary/tablet/200% reflow | FR-065–071, SC-010–013 | N/A | Contract Green | Manual device proof | Isolated Green; device gate open |

## Activation and verification status

- T112–T114, T117, and the hook/sheet/descriptor subset of T118 are Green within
  the Delete-owned injected boundary: 2 suites and 24 tests pass, including the
  StrictMode failure-reporting case.
- T115 is authored but not run. It cannot execute honestly without a live route,
  deterministic Delete fixtures, and shared integration.
- T118 remains partial because the Expo route is intentionally absent while the
  shared adapter is fail-closed and shared approved copy is not runtime-wired.
- T119 remains partial pending Maestro, device fidelity, real assistive
  technology, and shared integration gates.
- The Maestro flow is authored but cannot run honestly without a live route,
  shared approved copy, shared adapter activation, and deterministic Delete
  fixtures.
- The isolated command uses the approved `metals.delete/v1` payload only through
  an injected envelope creator. No shared adapter, registry, locale, fixture,
  barrel, detail route, schema, sync, Sell, Dispose, or Undo file changed.
- No live route, shared registration, device, or E2E completion is claimed.
