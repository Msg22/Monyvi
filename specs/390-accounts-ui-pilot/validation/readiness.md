# Foundation readiness and execution boundary

## Current authorization and source

Mohamed authorized the shared field foundation and its PR; Accounts route adoption remains a separate later delivery. Only tasks T001–T013 apply to this delivery. The copied Accounts pilot documents describe the wider approved target and future backlog; their historical planning-stage statements do not grant Accounts implementation authority.

The foundation worktree is E:/Work/My Projects/Monyvi-ui-field-foundation, branch codex/ui-field-foundation, stacked on PR383 branch 389-voice-usage-limits at exact head 0e7ee55abf6fb18af37e29e4f2e48ba45604a31e. GitHub and git ls-remote independently confirmed that open PR head and main 3264eba2b67bcc66cddc95e3fbdb36e8705ee642 before creation; git fetch completed. The main governance baseline remains 3264. References to d45745a5c8a13db082eab24e12c2cc072e26c124 in earlier spec/shared-field review are historical evidence, not review of the current dependency.

The new worktree was initially clean. Its node_modules junction resolves to E:/Work/My Projects/Monyvi/node_modules; Jest launcher exists. Primary and pilot files were preserved. No production code or tests changed.

## Approval package

The immutable approved package is sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. All eight canonical PNG/binding pairs, manifest, design contract and referenced CSS were copied byte-for-byte from the approved pilot. Their retention preserves the complete manifest; only shared foundation presentation is authorized for implementation here. The manifest file SHA256 is 9ea5594b34b0008eecafe074429c37628dfb620ecbe83f4ab2f1a0e704006b29 (file hash differs from the package hash by definition). Root's independent QA reverified all eight bindings PASS before setup; native rendering and all 35 QA scenarios remain NOT RUN.

## Task readiness

| Task | Current evidence and remaining gate |
| --- | --- |
| T001 | Authorized foundation-first scope and dependency route recorded; final writer allowlist and root acceptance still required. First delivery estimate 4–6 elapsed hours includes preflight 1–2 plus foundation 3–4; full pilot 10–16 is excluded. |
| T002 | Root independent QA reports eight bindings PASS at the unchanged package; local copies have byte equality. |
| T003 | BLOCKED: SDK adb works but no connected device. Existing AVDs Medium_Phone_API_36.0 and Pixel_7 available. Local Supabase containers running. Maestro exists at C:/Users/Mohamed/maestro/bin/maestro.bat. Metro8081 is already owned by primary-checkout Expo PID5132; no competing server launched. Primary checkout has a debug APK, but build identity/fixture support are unverified; new worktree has no APK. Authentication, synthetic fixture seed, Metro, driver insertion/caret and real public journeys remain unproved. |
| T004 | Independent QA audit owned by root's QA worker; source/test observations are not executed evidence. |
| T005 | Current dependency already has Dropdown.test.tsx, GroupedMoneyInput.keyboard.test.tsx, focus/blur forwarding, nullable Dropdown/error/adornment support. Do not duplicate these capabilities. Bounded current-caller review remains before final tests. |
| T006–T008 | Tests-first authoring may proceed only after root transfers a bounded test ownership lane. No authored or executed Red yet. |
| T009 | BLOCKED until meaningful shared-contract and controllable public-path Red are demonstrated. Setup failures cannot satisfy Red. |
| T010–T012 | Production edits blocked pending relevant T001–T003 gates and accepted T009. |
| T013 | Pending shared-contract Green and existing-consumer compatibility. Future Accounts grouped/signed journeys can remain Red pending Accounts adoption; they are not foundation Green claims. |

A real existing Metals purchase-price GroupedMoneyInput path is a proposed public compatibility/invalid-text test candidate, subject to actual driver, synthetic-user and build proof. No test-only product route is permitted. Signed/default Accounts APIs are not reachable through Accounts until its later adoption.

## Proposed exclusive lanes

Root alone orchestrates. The first test author may own only packages/logic/src/utils/__tests__/amount-helpers.test.ts and apps/mobile/__tests__/components/ui/{TextField.test.tsx,GroupedDecimalInput.test.tsx,Dropdown.test.tsx,GroupedMoneyInput.keyboard.test.tsx}, plus explicitly assigned new foundation tests and Maestro files after root's allowlist. Existing consumer journeys require independent test scope review; no Account route writes.

After Red acceptance, one foundation source owner owns amount-helpers.ts, TextField.tsx, Dropdown.tsx, GroupedDecimalInput.tsx and GroupedMoneyInput.tsx with corresponding tests. New FieldLabel/FieldMessage helpers, currency adapter, locale/barrel/style changes require concrete necessity and assigned ownership before edits. No Account routes, service behavior, database/schema, current business rules or app-wide #359/#360 adoption are included.

Local integration remains sole writer of the copied planning/readiness package until explicit transfer. Independent QA owns reports and reviews; it does not modify implementers' tests.

## Commands and honesty

From this worktree, existing suites can be run with:
- npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/components/ui/TextField.test.tsx __tests__/components/ui/GroupedDecimalInput.test.tsx __tests__/components/ui/Dropdown.test.tsx __tests__/components/ui/GroupedMoneyInput.keyboard.test.tsx
- npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/utils/__tests__/amount-helpers.test.ts
- npm run typecheck -w @monyvi/mobile
- npm run typecheck -w @monyvi/logic
- npm run lint -w @monyvi/mobile
- npm run i18n:check -w @monyvi/mobile

Run the local Maestro script only after its preflight/build/auth/fixture side effects are understood and the scoped synthetic harness is accepted. Existing YAML presence is not harness PASS. The installed SDK adb path is C:/Users/Mohamed/AppData/Local/Android/Sdk/platform-tools/adb.exe; use explicit argument arrays and bounded timeouts. No tests, device journeys, rendered comparison, native caret/IME, TalkBack or visual-fidelity checks have run.

Antigravity executable exists. Known bin locations provided no supported CLI launcher; resources/bin contains language_server.exe and webm_encoder.exe. No UI was launched and prior denied tools were not bypassed. This does not claim Antigravity is uninstalled.
