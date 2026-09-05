# US5: Sell a Whole Holding Without Account Credit

Owner: Slice 8A Sell lane

Date/build/base: 2026-09-05 / local development build /
`faa07725acc781c9be60e49ddcaef8b4869a7031`

Requirements: FR-025–032, FR-039–041, FR-049–055, FR-060–078, FR-083–091

Success criteria: SC-003–008, SC-010–013, SC-015, SC-018, SC-021–025, SC-028–030

Account credit is a separate blocked scenario group. T093–T100 cover only a sale
with `Receive money in` disabled and no account effect.

| ID             | Preconditions and fixture                                                          | User journey                                                                          | Expected observable result                                                                                     | Automated? | Evidence                                               |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| US5-NC-M01     | Active Gold holding, purchase cost EGP 151,278.20, fresh exact terminal references | Open Sell, enter EGP 170,000.00 gross and EGP 500.00 fee                              | Live summary shows EGP 169,500.00 net and EGP 18,221.80 profit; whole holding becomes Sold after direct submit | Yes        | Service/UI/Maestro Sell suites                         |
| US5-NC-M02     | Same holding, no fee                                                               | Record full holding sale                                                              | Fee is EGP 0.00, net equals gross, no partial-weight control appears                                           | Yes        | Service/UI suites                                      |
| US5-NC-M03     | Same holding                                                                       | Enter negative fee, fee above gross, zero gross, future date, or date before purchase | Field-specific error blocks persistence; focus moves to error summary then invalid field                       | Yes        | Service/UI suites                                      |
| US5-NC-M04     | Stale terminal metal reference                                                     | Review sale, acknowledge named stale input, submit                                    | Summary names stale input; submit remains blocked until acknowledgment                                         | Yes        | Preview/UI suites                                      |
| US5-NC-M05     | Active holding, device offline                                                     | Record sale, return to portfolio/history, restart app                                 | Local action completes without network; holding remains Sold after restart and appears in History              | Yes        | SQLite integration + Maestro                           |
| US5-NC-M06     | Active holding and existing EGP account                                            | Record sale without account credit                                                    | Account balance and ordinary/budget/earned-cashflow records remain unchanged                                   | Yes        | SQLite integration                                     |
| US5-NC-M07     | Same action ID delivered twice                                                     | Retry same action, then retry changed payload with same ID                            | Exact replay produces one sale; changed payload is rejected                                                    | Yes        | SQLite integration                                     |
| US5-NC-M08     | Injected local batch failure                                                       | Submit sale, then retry after failure                                                 | No root, state, event, or account partial effect remains; entered facts stay visible and retry succeeds        | Yes        | SQLite/UI integration                                  |
| US5-NC-M09     | Compact phone, ordinary phone, Arabic RTL, dark theme, 200% text, bottom inset     | Review and submit form                                                                | Required facts remain reachable, logical order preserved, 44px actions and bottom inset remain safe            | Partial    | UI assertions; device visual proof remains manual-only |
| US5-NC-M10     | Screen reader, keyboard, switch-control                                            | Traverse fields, summary, disabled credit explanation, Record sale, Cancel            | Roles, names, values, state, consequence, focus, and direct action are coherent without color                  | Partial    | UI assertions; assistive-device pass manual-only       |
| US5-CREDIT-M01 | Any account fixture before full #242 gate                                          | Open Sell                                                                             | `Receive money in` is visibly unavailable; sale without credit remains enabled                                 | Yes        | UI suite                                               |
| US5-CREDIT-M02 | Full #242 not integrated                                                           | Attempt account credit by any exposed control                                         | No account can be selected or credited                                                                         | Yes        | UI/SQLite suites                                       |

## Manual-only: US5-NC-M09-device-fidelity

Scenario: Compare ordinary-phone English/light Sell screen against approved
`10-sell-holding-entry.png`, then repeat compact, tablet/landscape, dark,
Arabic/RTL, and 200% text variants.

Why automation cannot honestly control it: RNTL proves layout contracts and
semantics but not rendered typography, contrast, clipping, or pixel fidelity.

Deterministic coverage retained:
`apps/mobile/__tests__/components/metals/sell-metal-holding-screen.test.tsx`.

Human owner and environment: visual QA owner / Android emulator and iOS device.

Pass/fail evidence: pending device-fidelity gate; do not claim visual
completion.

Runner follow-up: capture side-by-side screenshots for every deferred variant.

## Manual-only: US5-NC-M10-assistive-device

Scenario: Complete Sell with TalkBack/VoiceOver, hardware keyboard, and switch
control, including validation recovery and pending dismissal lock.

Why automation cannot honestly control it: Maestro and RNTL cannot assert real
focus speech, switch scanning, or hardware-keyboard focus rings.

Deterministic coverage retained:
`apps/mobile/__tests__/components/metals/sell-metal-holding-screen.test.tsx`.

Human owner and environment: accessibility QA owner / physical Android and iOS.

Pass/fail evidence: pending accessibility device gate.

Runner follow-up: retain manual coverage until device tooling exposes reliable
assistive-technology signals.
