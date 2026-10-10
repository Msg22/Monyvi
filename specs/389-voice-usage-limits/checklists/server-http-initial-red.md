# Actual parse-voice handler initial Red

Recorded 2026-10-07 UTC. Bounded external-test integration assignment began at
15:26:35; hard report bound 15:58. Root broker verified sibling checkout
`E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`, branch
`codex/issue347-delivery`, HEAD `ac1ef5583656190d04f3d068a742d98f742085cf` at
15:27. Main source checkout and production files were not changed by this
assignment.

## Scope and provenance

Applied the external author's six-file test proposal: `index.test.ts`,
`deno.test.import-map.json`, and fixtures `state.ts`, `edge-runtime.ts`,
`supabase-js.ts`, `google-genai.ts` under `supabase/functions/parse-voice/`.
Original proposal SHA-256:
`ed72ec1a64c009837eb089df2ce135f69df0337e20f8c10f10750336049eaa9c`. All proposal
contents, original actual handler imports, real consent helper, completed logs
and exit metadata were read through root-produced administrative relays.

The test import map replaces exactly three SDK/runtime imports: `edge-runtime`,
`@google/genai`, `@supabase/supabase-js`. It imports the unchanged actual
`parse-voice/index.ts`, captures its registered `Deno.serve` handler, and
invokes it with real Request/FormData objects. The real `_shared/ai-consent.ts`
executes against synthetic approved/revoked profile rows. SDK provider calls are
doubles; no actual Gemini or Supabase requests occur. Production Deno
configuration is unchanged. This is direct-handler integration evidence, not
network transport or HTTP/Postgres accounting evidence.

## Exact isolated command

Cwd is the verified sibling checkout. Root captured stdout/stderr, exit status,
signal and duration; timeout bound 180 seconds. Installed Deno 2.9.7 help
confirmed the flags. A separate denied-network Node builtin probe successfully
imported `node:assert/strict` without npm or downloads.

```text
C:/Users/Mohamed/.deno/bin/deno.exe test --no-config --no-lock --no-npm --no-remote --cached-only --no-prompt --deny-net --deny-import --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,GEMINI_API_KEY --import-map supabase/functions/parse-voice/deno.test.import-map.json supabase/functions/parse-voice/index.test.ts
```

Only those three environment names are permitted; the test supplies synthetic
values before importing the handler. No read/write permissions, real
credentials, provider calls, listening server, SQL application or device actions
were needed. Default Deno type checking remained enabled.

## Preserved setup failure and exact recovery

Attempt 1: 15:30:54.392–15:31:00.552, 6.160 seconds, exit 1, signal null, no
timeout, **zero tests executed**. Syntax EOF at
`test-fixtures/supabase-js.ts:94` was an application/transport setup failure,
not behavioral Red.

The authored patch declared 94 added lines for this one new file but
contained 96. Its final authored `  };` and `}` were outside the declared hunk
and were ignored by patch application. All five other hunk counts matched. Root
recovered exactly all 96 original author-added lines, with no independent
implementation or assertion change. Recovered file SHA-256:
`ddb9a3f116ad5fed7dc01f03915c4fa2c960cf247b19030848a9503f800720c7`. Attempt 1
logs remain intact.

## Executed result

Attempt 2: 15:34:12.929–15:34:29.821, 16.892 seconds, exit 1, signal null, no
timeout. Deno checked the suite and executed **11 tests: 6 passed, 5 failed**.
No loader or type error remained.

| Executed scenario                                                          | Observed result                                   | Classification                |
| -------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Handler registration capture                                               | Passed                                            | Existing-handler control      |
| Success payload, explicit caller local date, authenticated provider prompt | Passed                                            | Existing success/date control |
| Unauthenticated request                                                    | 401; provider double not invoked                  | Existing auth control         |
| Revoked consent through real consent helper                                | 403; provider double not invoked                  | Existing consent control      |
| Invalid nonempty caller local date                                         | 400; provider double not invoked                  | Existing input control        |
| Three retryable provider failures followed by success                      | Four attempts; existing 2/4/8-second retry delays | Existing retry control        |
| Missing request key                                                        | Actual 200/provider count 1; expected 400/count 0 | Genuine behavioral Red        |
| Missing caller timezone                                                    | Actual 200/provider count 1; expected 400/count 0 | Genuine behavioral Red        |
| Request key length 161                                                     | Actual 200/provider count 1; expected 400/count 0 | Genuine behavioral Red        |
| Caller timezone length 129                                                 | Actual 200/provider count 1; expected 400/count 0 | Genuine behavioral Red        |
| Unknown IANA timezone (`Mars/Olympus`)                                     | Actual 200/provider count 1; expected 400/count 0 | Genuine behavioral Red        |

The five assertions execute at test registrations 242, 256, 270, 284 and 298;
the shared response/provider-count assertion is line 142. They fail on actual
handler behavior before production changes, rather than on structural absence or
fixture setup.

## Limits and successor gates

No daily/burst quota, reserved versus completed accounting, request replay,
request collision, controlled clock/day boundary, account isolation, malformed
provider response, final provider failure, timeout, genuine DB concurrency,
cleanup scheduling or native recording journey has been established by these 11
tests. RPC doubles do not substitute for actual Postgres behavior. Retain the
canonical interface-bootstrap staging and require isolated local DB/session
tests before any quota/race claim.

Evidence lives in the worktree Git administrative folder:
`server-http-initial-red-{output.txt,exit.json}` and
`server-http-initial-red-attempt2-{output.txt,exit.json}`. No broad baseline,
per-file lint/type/format batch, production fix, commit or push was performed.
Application responsibility can return to the lead after the bounded report.

Evidence cutoff: **15:49:19 UTC**, **22 minutes 44 seconds** from actual
15:26:35 intake. The authorized integration and evidence work is complete before
the 15:58 hard bound; all six test adapter files' temporary application
responsibility is released to the lead. No production implementation or
successor runner is started by this worker.
