# Validation Quickstart: Accounts UI Pilot

This is a future implementation checklist. Commands below were verified against existing package scripts but have NOT RUN in this planning stage. Do not execute until root reviews the plan, generates canonical tasks and authorizes implementation.

## 1. Establish isolated source and approved design

Use E:/Work/My Projects/Monyvi-accounts-ui-pilot, branch codex/accounts-ui-pilot. Preserve dirty primary checkout. Reuse main node_modules junction; never npm install/npm ci in the secondary worktree.

Record exact branch/HEAD, feature390 selector and approved package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. Refresh Msg22/Monyvi main/PR383 and resolve integration route through one reserved owner. Current plan reconciliation used main3264... and PR head0e7ee55...; abbreviated strings here are explanatory, full revisions are in plan.md.

Run the repository mockup-binding verifier separately for each of the eight manifest sidecars before governed coding/comparison. Require exit0 and matching image/facts/approved combined revision. Verify package-order hash too. Image/fact changes require renewed approval.

## 2. Prove Red before production edits

Foundation owner starts with focused shared regression tests: required-name overrides/locale, Type-group semantics, default/outlined compatibility, invalidabc12345 controlled display, signed opt-in/correction/grouped paste, unchanged precision and pristine focus/blur.

Account owner follows published foundation API, authoring real-control screen integration and complete controllable Maestro journeys before adoption production edits. Existing schema-only oversized fixtures are not valid native UI journeys.

Candidate commands from existing scripts, run from worktree root:

```powershell
npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/components/ui/TextField.test.tsx __tests__/components/ui/GroupedDecimalInput.test.tsx
npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/utils/__tests__/amount-helpers.test.ts
npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/hooks/useAccountForm.test.ts __tests__/hooks/useEditAccountForm.test.ts __tests__/validation/account-validation.test.ts
npm run e2e:flow:local -- e2e/maestro/accounts/egyptian-institution-presets.yaml
```

Existing Maestro file is a starting suite, not coverage for all new journeys. Confirm seeded synthetic user, runner/emulator/Metro and local fixture environment before executing. Never let E2E default to live SMS provider. Failure injection, clipboard and offline/restart controls must be verified honestly; setup failure is not meaningful Red.

## 3. Verify Green and compatibility

After scoped implementation run focused changed/new suites and affected shared-consumer regression suites; capture actual identifiers against all35 manual cases. Keep helper/weight/keypad unsigned and outlined defaults unchanged outside explicit Accounts options.

```powershell
npm run typecheck -w @monyvi/mobile
npm run typecheck -w @monyvi/logic
npm run lint -w @monyvi/mobile
npm run i18n:check -w @monyvi/mobile
```

Use appropriate changed-file lint for logic as well. Commands may fail for unrelated baseline/environment issues; record exact cause and do not erase meaningful failures or alter tests to hide implementation bugs.

## 4. Verify native presentation and complete journeys

Record build/revision, OS/device, viewport, density, font scale, locale/theme, insets/navigation mode, keyboard and network controls. Compare declared ordinary390×844 and compact320×568/font1.5 references in their documented context; native measurement establishes mapping, not HTML assumptions.

Exercise all35 scenarios with explicit results. Capture tablet/landscape/dark/RTL/enlarged variants and screen-reader order/modal focus. Native font/emoji/BlurView/caret/clipboard/IME and TalkBack/VoiceOver require their own evidence; assertions and driver inputText do not establish them. Preserve existing platform font.

## 5. Independent review and handoff

Independent QA audits coverage; TypeScript → logic → style review proceeds on exact integrated revision. Fix each actionable finding under its owner's scope, rerun the smallest affected checks, then re-review. Do not claim CI substitutes for skipped device/native checks.

Report functional, visual, accessibility and CI readiness separately; include the mandatory35-case coverage matrix, native/manual blockers and exact approved package. Issues359/360 remain open for their wider adoption. No PR/commit/push is authorized by this quickstart.
