# US5 Sell Coverage

Base: `faa07725acc781c9be60e49ddcaef8b4869a7031`

Scope: T093–T100 sale without account credit. T101–T103 credited Sale remain
blocked by full #242. Shared locale registration, shared action-adapter
activation, barrels, and holding-detail composition belong to integration
owners.

| Scenario | Requirement / criterion | Unit or integration | UI | E2E | Status |
| --- | --- | --- | --- | --- | --- |
| Whole active holding, gross/fee/net, realized P/L | FR-025–029, FR-049–050, SC-004, SC-025 | `sell-metal-holding-command-service.integration.test.ts` | `sell-metal-holding-screen.test.tsx` | `sell-holding.yaml` | Red confirmed |
| Fee zero, negative, above gross, same sale currency | FR-027, SC-021, SC-025 | Service integration | UI | E2E valid path | Red confirmed |
| Sale-date boundaries and validation focus | FR-026, FR-067, FR-078, SC-028 | Service integration | UI | Valid path | Red confirmed |
| Stale/unknown named acknowledgment and provenance | FR-054–055, FR-073–075, SC-006, SC-018 | Service integration | UI | Fixture path | Red confirmed |
| No account, income, budget, cashflow side effect | FR-028, FR-031–032, FR-091, SC-008, SC-023 | SQLite integration | Disabled-credit proof | E2E visible proof | Red confirmed |
| Atomic local commit, rollback, replay, restart | FR-039, FR-062, FR-076–078, SC-003, SC-015 | SQLite integration | Hook pending/error/retry | Offline/restart | Red confirmed |
| Sold projection and permanent History | FR-029, FR-040–041, SC-007, SC-030 | SQLite integration | Consequence summary | Offline/restart | Red confirmed |
| Direct submit, no confirmation/review route | FR-028, FR-086 | Service integration | UI | E2E | Red confirmed |
| Safe area, compact/ordinary reflow, RTL/theme/200% | FR-065–071, SC-010–013 | N/A | UI contract | Manual device proof | Red confirmed; device gate pending |
| Credited Sale | FR-030–031, SC-008 | T101 | T103 | T102 | Blocked by T033 |

## Required manual gates

- Ordinary-phone English/light side-by-side against approved Screen 10.
- Compact, tablet/landscape, dark, Arabic/RTL, and 200% text screenshots.
- TalkBack/VoiceOver, hardware keyboard, and switch-control completion.
- Physical offline restart if emulator runner cannot honestly isolate transport.

No visual, accessibility-device, shared-locale, or credited-Sale completion is
claimed by this file.
