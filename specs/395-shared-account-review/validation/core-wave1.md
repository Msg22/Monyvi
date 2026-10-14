# #395 Core Wave 1 — T005/T007 test-authoring receipt

**Status:** checkpoint / test authoring in progress; **no production implementation authorization**. Branch `codex/395-core-worker` was created from immutable `7e27eb55c642dccef44f4b977a8712ab320ecd18` after an immediate 404 branch-absence recheck and post-create SHA verification. Trusted governing main is `7838df64eb9b3828c6e8f1a02f590b008d5435fd`.

## Scope and assumptions (pre-test checkpoint)

- Sole writer: this Normal ChatGPT worker; only `packages/logic/src/account-review/__tests__/{schemas.test.ts,fixtures.ts}`, `scripts/__tests__/account-review-edge-contract.test.ts`, `apps/mobile/__tests__/services/account-review-parser-adapters.test.ts`, and **this report** may change. UI owns T006/T008; root owns feature integration and ledger.
- Read-only authorities: pinned `specs/395-shared-account-review/{spec,plan,tasks,data-model,manual-test-plan}.md` and contracts including **T004 `contracts/wire-shapes.md`**, plus approved persona, offline-financial-systems skill, team-led routing exception and TDD guide.
- TDD intent: focused executable tests should first fail on missing **named canonical schema/adapter/generator exports** or behavior, without creating production stubs or loosening assertions. No tests are claimed run in this remote connector environment; root will run the batched foundation Red pass.
- T005: strict validation of request contexts/evidence/Voice and SMS v2 including required nullable fields, canonical IDs/currency/domain vocabulary, UTF-16 spans and their source matching, reciprocal row↔suggestion references, omitted-versus-unknown uncertainty, locally recoverable malformed advisory data, and CASH Voice versus ordinary SMS restrictions.
- T007: generated Edge/projection parity and provider-safe context, explicit version-negotiated v1 compatibility, configured Gemini Voice/DeepInfra SMS shapes, original-call count, result correlation and existing safeguards with deterministic mocked transports only.
- No provider calls, hosted SQL or deployment, emulator, PR/issue/Page mutation, UI tests, packages/dependencies changes, generated output, contract rewrites or writes outside the above allowlist. Tests will use actual repository runner/patterns; no standalone fake implementation of the contracts.
- The latest lead default-state CAS shape is authoritative (`DefaultSnapshot.activeAccountIds/defaultAccount`), not the superseded logical revision proposal. Wave 1 does not modify default-action code/contracts.

## Evidence and final ledger

**Checkpoint only.** A subsequent authorized test-only commit will populate this section with the exact commit/parent/blob identities, scenarios, Red-command instructions, and explicit unresolved implementation exports or harness limitations. Static authored tests do not prove runtime pass or Red execution.
