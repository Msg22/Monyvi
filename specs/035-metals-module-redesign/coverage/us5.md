# US5 Sell Coverage

Stable base: `a190d8f` (after the conflict-free Sell Red rebase).

Scope: T093–T100 sale without account credit. T101–T103 credited Sale remain
blocked by full #242. Shared locale registration, shared action-adapter
activation, barrels, and holding-detail composition belong to integration
owners.

| Scenario | Requirement / criterion | Unit or integration | UI | E2E | Status |
| --- | --- | --- | --- | --- | --- |
| Whole active holding, gross/fee/net, realized P/L | FR-025–029, FR-049–050, SC-004, SC-025 | `sell-metal-holding-command-service.integration.test.ts` | `metals-sell.test.tsx` | Authored, blocked on route/fixture | Isolated Green |
| Fee zero, negative, above gross, same sale currency | FR-027, SC-021, SC-025 | Service integration | UI | Authored valid path | Isolated Green |
| Sale-date boundaries and validation errors | FR-026, FR-067, FR-078, SC-028 | Service integration | UI | Authored valid path | Isolated Green; device focus recovery open |
| Stale/unknown named acknowledgment and provenance | FR-054–055, FR-073–075, SC-006, SC-018 | Service integration | UI | Authored fixture path | Isolated Green |
| No account, income, budget, cashflow side effect | FR-028, FR-031–032, FR-091, SC-008, SC-023 | SQLite integration | Disabled-credit proof | Authored visible proof | Isolated Green |
| Atomic local commit, rollback, replay, restart | FR-039, FR-062, FR-076–078, SC-003, SC-015 | SQLite integration | Hook pending/error/retry | Authored offline/restart path | Isolated Green; runtime blocked |
| Sold projection and permanent History | FR-029, FR-040–041, SC-007, SC-030 | SQLite integration | Consequence summary | Authored offline/restart path | Isolated Green; route projection open |
| Direct submit, no confirmation/review route | FR-028, FR-086 | Service integration | UI | Authored | Isolated Green; live route open |
| Safe area, compact/ordinary reflow, RTL/theme/200% | FR-065–071, SC-010–013 | N/A | UI contract | Manual device proof | Isolated Green; device gate pending |
| Credited Sale | FR-030–031, SC-008 | T101 | T103 | T102 | Blocked by T033 |

## Required manual gates

- Ordinary-phone English/light side-by-side against approved Screen 10.
- Compact, tablet/landscape, dark, Arabic/RTL, and 200% text screenshots.
- TalkBack/VoiceOver, hardware keyboard, and switch-control completion.
- Physical offline restart if emulator runner cannot honestly isolate transport.

No visual, accessibility-device, shared-locale, or credited-Sale completion is
claimed by this file.

## Activation and verification status

- T093–T098 are Green within the Sell-owned, injected boundary.
- T099 is partial: hook, presentational screen, and isolated action descriptor
  are Green; the Expo route is intentionally absent while the shared action
  adapter remains fail-closed and shared approved copy is not registered.
- T096 is authored but not run: Maestro has neither a registered Sell fixture
  nor a live route to drive.
- T100 remains partial until shared integration plus the device fidelity and
  assistive-technology gates complete.
- The isolated command never imports or activates the shared adapter, never
  writes account/income/budget/cashflow records, and accepts the approved
  envelope creator only through dependency injection.
