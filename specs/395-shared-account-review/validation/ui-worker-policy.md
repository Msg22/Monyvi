# #395 Worker Policy — free OpenCode and explicit native consent

**Scope:** routing-only documentation correction on `codex/395-ui-worker`,
parent `76c9d0c30e49426c08a285edf6db472f156abb5e`. This receipt records a new
explicit user policy which supersedes the previously reviewed workflow version
at `7e27eb55c642dccef44f4b977a8712ab320ecd18` only on the points below. The
trusted governing main remains `7838df64eb9b3828c6e8f1a02f590b008d5435fd`.

## Current governing routing

**Normal ChatGPT → independently verified OpenCode FREE-model route →
Antigravity Gemini/Claude → native Codex only after Mohamed's prior per-task
permission.**

- Exclude **paid** OpenCode models/routes, not OpenCode as a whole. Before
  OpenCode dispatch check the exact current installed model identifier with
  `opencode models`, verify the exact provider/model route's current official
  **free pricing**, runtime executable path, authentication, tools, permission
  scope, persistent session and first non-error response. Do not assume a
  model's name, free status, quota, price, or successful invocation. Never
  precheck remaining quotas or usage.
- If a free OpenCode runtime fails, preserve the session/work and arrange
  durable root-owned repair of executable/model/auth/tool issues. A model or
  tool failure is **not** a reason to retire all free OpenCode capabilities or
  restore paid routes. Proceed to capable Antigravity Gemini/Claude when
  necessary, subject to its external-provider data-sharing opt-in. Verify its
  exact models and capability at dispatch; no fabricated IDs.
- **No native worker may be spawned, resumed, repurposed, or assigned follow-up
  work without first asking Mohamed and obtaining explicit approval for that
  exact task.** This includes old completed-native sessions, independent review,
  local checking, integration and test verification. Record task purpose, file
  allowlist, duration estimate, owner/worktree, stop and reassignment limits,
  and why each primary pool is not suitable. Broad feature/full-delivery
  authorization, earlier native approval, timeout, unavailable runtime or spare
  native capacity is not permission. If not approved, pause the dependent lane
  and present alternatives.

The **canonical policy** is `.agent/workflows/team-led-delivery.md`.
`.agents/skills/team-led-delivery/SKILL.md` is only a small routing wrapper. The
feature-specific `tasks.md` and `quickstart.md` reference the same policy;
historical OpenCode delegation entrypoints remain retired, not reactivated. No
active native task or runtime verification was initiated in this leaf.

## Authorized document paths

| Path                                                             | Change                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.agent/workflows/team-led-delivery.md`                          | Canonical routing order, free-model/pricing/callability requirements, root-owned repair, and explicit native-permission hard stop throughout preflight, handoffs, waves, ledger and blockers |
| `.agents/skills/team-led-delivery/SKILL.md`                      | Minimal wrapper aligned with the canonical order and native gate                                                                                                                             |
| `specs/395-shared-account-review/tasks.md`                       | Routing paragraph only; task IDs, scope, dependencies, B1 and coverage unchanged                                                                                                             |
| `specs/395-shared-account-review/quickstart.md`                  | Dispatch step 4 only; all other QA/gate/tool rules unchanged                                                                                                                                 |
| `specs/395-shared-account-review/validation/ui-worker-policy.md` | This receipt (new)                                                                                                                                                                           |

## Static documentation checks and nonclaims

- Verified branch starting HEAD `76c9d0c30e49426c08a285edf6db472f156abb5e`
  before authoring.
- Checked canonical order and references to free OpenCode, Antigravity
  Gemini/Claude, per-native-task permission, including completed-native
  follow-up/read-only review/local verification, and the no-quota-precheck rule.
- Checked skill and feature docs for previously contradictory "Normal →
  Antigravity → native fallback" wording and replaced it.
- Only the five listed documentation paths may change in this commit; protected
  T006/T008 tests, JSON, contracts, schema/helper/SQL files, B1 approvals,
  mockup/asset bytes, results, PRs, issues and main remain intact.
- **NOT RUN / NOT CLAIMED:** OpenCode or Antigravity runtime/model/pricing
  verification, authentication setup/repair, native-worker activation,
  production or test execution, CI, device/emulator, provider call, hosted
  migration or deployment. Those operational tasks remain root-owned and are
  gated separately; this leaf changes policy text only.
- Preserve all preexisting scope, TDD, fidelity/approval, financial/privacy,
  external-provider opt-in, estimate/overrun, contact recovery, ownership,
  branch lease and independent review controls. No historic result is rewritten.

**Outcome:** policy documentation authored only; branch writes frozen after the
exact commit/file diff is verified.
