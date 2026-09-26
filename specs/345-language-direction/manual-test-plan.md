# Manual verification and coverage matrix

| Scenario | Automated coverage added and passed | Native/manual evidence still required |
| --- | --- | --- |
| English translations with retained RTL; inverse Arabic case | `utils/rtl.test.ts`, `hooks/useLanguageRuntime.test.ts` | Cold launch on Android |
| Matching direction | `services/language-coordinator.test.ts` | No visual interruption |
| Screen-reader language after translation-only startup correction | `hooks/useTranslationLanguage.test.ts` | VoiceOver/TalkBack pronunciation on device |
| Public selection remains selected without reload | `components/LocaleStartup.integration.test.tsx` | Both Maestro journeys authored, execution pending |
| Arabic device with explicit English | Native setter assertions in `utils/rtl.test.ts` | Actual device locale test |
| Profile resolution before application | `hooks/useLanguageRuntime.test.ts`, scoped `hooks/usePreferredLanguage.test.ts` | No alternating reloads |
| Account switch and pending work | `services/language-coordinator.test.ts` | Offline cold launch/resume |
| Storage/reload failures | `services/language-selection.test.ts`, coordinator fault injection | Error copy for failed saving; account remains usable after direction failure |
| Duplicate requests and repeated mismatch | Coordinator serialization, marker, stale scope, hung reload tests | No native restart loop |
| Nonblocking direction warning | `LanguageFailureNotice.test.tsx`, `Toast.test.tsx`, `AppReadyGate.test.tsx`, private layout tests | EN/AR light/dark large text; tap/TalkBack dismissal; close and reopen |

No connected device currently. Maestro runner available; runtime checks pending.
User will perform device validation after implementation. Run both
`apps/mobile/e2e/maestro/auth/language-direction-public.yaml` and
`apps/mobile/e2e/maestro/auth/language-direction-settings.yaml` against local/fixture
configuration. Their text checks verify persistence and navigation; captured screenshots
must be reviewed for actual header/tab/card direction. Native debug and release, iOS,
physical-device locale changes, offline cold launch, and fault-injected restart failure
remain manual/unexecuted here. No runtime/E2E success is claimed.

## Device checklist

1. Keep the existing installation and local data. Open this branch with English selected;
   verify dashboard greeting, header actions, account cards, drawer and bottom tabs are LTR.
2. Switch Settings to Arabic. After reload, verify Arabic text and RTL layout. Reopen Settings
   and switch back to English; verify both text and direction change together.
3. Force-stop and reopen in each language. Confirm selection persists and no repeated reload
   occurs. Repeat English with the device itself configured in Arabic.
4. While signed out, switch the language pill Arabic then English. Force-stop/reopen after
   each selection. Sign in to an account with a different saved language and verify its
   profile preference wins without alternating reloads.
5. In an already-loaded account, disconnect the network and reopen. Confirm local account
   information remains available under existing startup rules and selected direction stays correct.
6. Switch between test accounts with different saved languages. Confirm neither previous
   account data nor its in-flight language change appears in the next account.
7. Fault-injected native reload failure is manual-only unless a device harness supplies it:
   verify one dismissible warning recommends closing/reopening, account stays usable, and
   no logout or blocking recovery screen is required. Check large text and TalkBack dismissal.
