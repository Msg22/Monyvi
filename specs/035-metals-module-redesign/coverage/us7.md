# US7 Delete Coverage

Stable base: `a190d8f`.

Scope: T112–T119 Active-only mistaken-record Delete. Shared adapter/registry,
locales, fixture registry, detail composition, and live route activation remain
integration-owned.

| Scenario | Requirement / criterion | Service integration | UI/hook | E2E | Status |
| --- | --- | --- | --- | --- | --- |
| Effective Active-only grouped Delete | FR-037–040, FR-087, SC-003–004 | Red authored | Red authored | Authored, blocked | Red |
| Hidden non-effective audit and no reappearance | FR-037, FR-040, FR-079, SC-007, SC-030 | Red authored | Consequence copy | Authored restart path | Red |
| Zero sale/disposal/proceeds/P&L/write-off/transfer/account effect | FR-037, FR-091, SC-023 | Red authored | Destructive semantics | Authored visible proof | Red |
| Sold/Disposed/non-effective rejection | FR-038, FR-087 | Red authored | Descriptor boundary | Authored terminal path | Red |
| Replay, hash mismatch, duplicate lock | FR-076–077, FR-080, SC-015 | Red authored | Red authored | Double-tap authored | Red |
| Atomic rollback and retry | FR-039, FR-078, FR-089–090 | Red authored | Red authored | Authored | Red |
| User scope and offline/restart persistence | FR-060–064, SC-003 | Red authored | Offline copy | Authored | Red |
| Approved focused Screen 14 facts and copy | FR-092, FR-102 | N/A | Red authored | Authored | Red |
| Safe area, RTL/theme, compact/ordinary/tablet/200% reflow | FR-065–071, SC-010–013 | N/A | Red authored | Manual device proof | Red; device gate open |

## Activation and verification status

- T112 is authored from the approved spec, business decisions, command/read
  contracts, and Screen 14 content contract.
- T113–T115 are intended Red artifacts until their owned production modules
  exist.
- The Maestro flow is authored but cannot run honestly without a live route,
  shared approved copy, shared adapter activation, and deterministic Delete
  fixtures.
- No live route, shared registration, or device completion is claimed here.
