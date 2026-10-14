# Issue 347 isolated local runtime

Bounded runtime-only assignment, 2026-10-07 UTC. Start 15:50; checkpoints 16:20
and 16:40; hard report bound 16:50. This artifact records target/build
readiness, not feature completion. Production/config/migration/type ownership
remains with the external authors and lead.

## Authorized boundaries

- Evidence checkout: `E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`,
  branch `codex/issue347-delivery`, pinned HEAD
  `ac1ef5583656190d04f3d068a742d98f742085cf`.
- Build checkout: `E:/Work/My Projects/Monyvi-issue347-mobile`, branch
  `codex/issue347-mobile`, same pinned HEAD; root reports clean creation with
  shared dependency junction. Fresh identity/configuration proof remains
  required before build.
- Server checkout: `E:/Work/My Projects/Monyvi-issue347-server`, branch
  `codex/issue347-server`, same pinned HEAD. No source implementation is
  assigned here.
- Only intended new Android target: `Monyvi_Issue347_API34`, installed system
  image only, explicit emulator console port 5560 / expected serial
  `emulator-5560`. No downloads, personal AVD cloning or shared-device actions.
- Only intended new DB target: container `monyvi-issue347-postgres`, database
  `monyvi_voice_qa347`, synthetic credentials, loopback binding
  `127.0.0.1:54332`. No shared Supabase container or hosted endpoint mutations.
- Intended Metro port: 8082 after proof it is free and belongs to the mobile
  worktree. A dedicated Postgres container is not a Supabase HTTP endpoint.
  Shared Kong54321 must not become the app's fixture endpoint.

All repository reads/execution and runtime mutations are root-brokered through
sanctioned tools. The worker consumes root-produced administrative relays only.
Each mutation requires an exact proposed command, path and environment scope
sent to the lead. No native repository exploration, blocked-tool retry,
installs, branch/commit/push or provider calls.

## Initial discovery

Android MCP metadata exposes Droidrun `app`, `back`, `home`, `device_info`;
their available contracts provide no explicit device serial selector. They
cannot prove safe routing to this new dedicated emulator. No unscoped Droidrun
action was invoked. Use absolute installed SDK executables and explicit serial
after target creation.

The root's fresh primary-pool audit at 15:44:45.409 was read completely from
`primary-pool-isolated-runtime-audit.json`: Normal ChatGPT authors cannot
operate local runners; OpenCode's safe source/session route remains stopped
although version 1.18.29 exits successfully; Antigravity desktop exists but no
callable agy/MCP worker/model/tool. No further desktop/worker probe occurred.
Runtime metadata, cache/image availability, ports, dedicated target creation and
build are **not yet verified in this assignment**.

Full communication, React Native testing and Maestro skills plus project Maestro
README were reloaded from the root's sanctioned source relays. The README's
generic local wrappers can seed/reset the shared default backend, reverse
8081/54321 and launch the app, so they are not appropriate for this isolated
target. SMS fixture mode does not isolate Voice. Build/Metro environment must
prevent private dotenv loading and use only synthetic/public local values;
configuration source must prove that boundary before execution.

## Execution gates

1. Verify installed AVD manager/image package, emulator/ADB, JDK, matching
   cached Gradle distribution, Maestro usability and free ports before
   mutations. Do not download missing capability.
2. Create only a new dedicated AVD path/name with the verified installed image;
   boot without loading personal snapshots. Prove own serial and boot/build
   identity before APK installation.
3. Build from verified mobile worktree using cached dependencies/offline
   execution. Direct assembly/install avoids automatic app launch. If native
   generation is required, resolve its build-artifact scope before any prebuild;
   no tracked config changes.
4. Create dedicated loopback Postgres from a verified cached compatible image;
   prove exact container/database/current user, locale, pgTAP/dblink
   availability and distinct backend PIDs. Extension bootstrap on this DB is
   runtime setup; no Voice feature SQL is applied.
5. App launch or user journeys require a separately proven isolated synthetic
   account/fixture HTTP runtime, source/Metro ownership and corrected per-run
   YAML identity. Installation or a booted emulator alone does not establish
   these.

## First read-only inventory

Read complete `isolated-runtime-metadata.json` plus package/app/build
configuration from `qa-broker-isolated-build-source.txt`. Fresh compose on the
worker checkout stalled and was terminated read-only; no retry or source change.
Same pinned-base context and sanctioned source reads were used.

- Android SDK: `C:/Users/Mohamed/AppData/Local/Android/Sdk`; `cmdline-tools`
  absent. Installed API34 image is
  `system-images;android-34;google_apis;x86_64`, revision 14, declared minimum
  emulator 34.2.16. API36 Play Store image also exists; it will not be used for
  this dedicated API34 target. Compile platforms 35/36 exist.
- `apps/mobile/android` is absent in the worker checkout. Root explicitly
  authorized ignored native build generation within existing delivery/runtime
  scope, conditional on no tracked source/config overwrites. No generated
  Android source is copied from the main checkout.
- Existing main native wrapper is Gradle 9.0.0; that distribution cache exists.
  This is a cache reference, not proof of the worker's yet-ungenerated native
  configuration or successful build. Java is absent from PATH; JDK17 and Android
  Studio JBR directories exist, executable version checks pending. Maestro batch
  executable exists at `C:/maestro/bin/maestro.bat`; current invocation
  usability remains pending.
- Initial port metadata found no TCP entries for 5560/5561/8082/54332. The only
  online ADB target was the shared Samsung phone. These must be rechecked before
  creation; phone was not acted on.
- Cached Supabase Postgres image tags include 17.6.1.134 (`9faa7279bcf1`) and
  earlier tags. Architecture/full ID/entrypoint compatibility pending; no
  image/container creation or pulling has occurred.
- Static worker app config declares package `com.monyvi.app` and project native
  plugins. Debug assembly should not launch the app. Sentry upload must remain
  disabled; private dotenv loading and network package acquisition must remain
  disabled during native generation/build.

Worker test transfer manifest at 15:54:46.890 was read completely: ten
externally authored server test files and eight mobile test/YAML files were
copied with hashes after preceding QA ownership release. Both worker HEADs
remain pinned; worker status is expected test-only dirty, not clean after this
transfer. No production ownership moved to this runtime worker.

Status: second targeted installed-tool/cache/configuration proof requested; no
runtime mutation performed yet.

## Installed capability proof and exact creation proposals

Read complete `isolated-runtime-followup-metadata.json` (16:03:47.824), full
custom native plugins, installed CLI help and
`isolated-runtime-maestro-cache-metadata.json` (16:04:22.520).

- Absolute emulator reports 36.3.10.0, build 14472402, exit 0. Acceleration
  check exits 0: `WHPX(10.0.26100) is installed and usable.` Installed API34
  image's emulator requirement is satisfied.
- Absolute `C:/Program Files/Java/jdk-17/bin/java.exe` reports Java17.0.12,
  exit 0. SDK build tools 34.0.0/35.0.0/35.0.1/36.0.0/36.1.0,
  NDK26.1/27.0/27.1/29 and CMake3.22.1 are installed. Generated project
  requirements still need comparison before offline assembly.
- Cached image `public.ecr.aws/supabase/postgres:17.6.1.134` is amd64, immutable
  ID `sha256:9faa7279bcf1fd6834e65dc876b11e39cb53030bcb3d653beb7e5668200acbb5`,
  entrypoint `docker-entrypoint.sh`. Shared DB uses 17.6.1.132; only its
  image-name metadata was inspected, not its data or environment.
- Worker Android directory is Git-ignored; no dynamic app config exists. Both
  custom plugins only generate native Android files/manifest changes; no private
  dotenv import appeared in those sources. Local cached Expo template is
  `E:/Work/My Projects/Monyvi/node_modules/expo/template.tgz`; installed
  prebuild help supports local `--template`, `--no-install`,
  `--skip-dependency-update`.
- Cached Gradle9.0.0 distribution is extracted beneath
  `C:/Users/Mohamed/.gradle/wrapper/dists/gradle-9.0.0-bin/d6wjpkvcgsg3oed0qlfss3wgl/gradle-9.0.0/bin`.
- Maestro Windows batch version probe exits 1 with
  `The syntax of the command is incorrect.` Full launcher confirms nested cmd
  quoting around spaced Java path. A single direct Java invocation of the same
  actual main/classpath/options is requested; no launcher install/edit or
  repeated broken batch command.

Exact root-broker creation requests were sent before execution. Both remain
conditional on fresh target-name/path absence and free ports:

```text
docker run --pull=never --detach --name monyvi-issue347-postgres --label monyvi.issue=347 --label monyvi.owner=voice_runtime_qa --publish 127.0.0.1:54332:5432 --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=monyvi_qa347_synthetic_only --env POSTGRES_DB=monyvi_voice_qa347 --env PGDATA=/var/lib/postgresql/data sha256:9faa7279bcf1fd6834e65dc876b11e39cb53030bcb3d653beb7e5668200acbb5 postgres -D /var/lib/postgresql/data -c listen_addresses=*
```

No reused data volume, image pull, feature migration or shared database
connection. First DB queries must prove database/user/locale and pgTAP/dblink
availability before extension bootstrap is proposed.

Dedicated AVD fallback uses fresh empty `.ini`/`.avd/config.ini` under
administrative `isolated-runtime/avd`, with `ANDROID_AVD_HOME` set to that path.
New config references installed SDK-relative API34 Google APIs x86_64 image, two
CPUs/2048MB RAM, 1080x1920/density420, 2GB data partition, keyboard/audio input
enabled, GPU auto and cold boot. No existing AVD configuration/userdata is
copied. Exact boot request:

```text
C:/Users/Mohamed/AppData/Local/Android/Sdk/emulator/emulator.exe -avd Monyvi_Issue347_API34 -port 5560 -no-window -no-snapshot -no-boot-anim -gpu auto
```

Environment is minimal OS runtime plus explicit installed SDK and dedicated AVD
paths. Hidden owned process/logs and a bounded boot wait are required. Target
proof uses only `adb -s emulator-5560`; no app launch/grants or shared phone
action.

Ignored native generation proposal uses the verified local Expo template, no
install/clean, preserved React versions, offline/no-dotenv/no-telemetry
settings, disabled Sentry upload, synthetic public Supabase values at unbound
54331, and an empty public Sentry DSN. Source/hash/port/template guards are
pending before generation. No private environment file is copied or read.

## Separate output-routing successor — 2026-10-07 21:11 UTC

Lead authorized a distinct runtime-only successor within the existing overall
continuation: estimate 10–15 minutes, **hard task report 21:30 UTC**, overall
stop 21:37 UTC. Previous assignment ended before its 21:10 bound; it is not
silently extended. Own only administrative/ignored runtime artifacts and this
checklist; no production/test source, install/download, app launch or provider
operation.

Full `primary-pool-output-routing-audit.json`, 21:11:01.540 UTC, was read:
Normal ChatGPT remote authors cannot operate local runtime; OpenCode's
controlled source/session failure remains stopped despite executable resolution;
Antigravity desktop exists without callable CLI/MCP worker. Fresh fallback is
scoped to this runtime correction.

Lead's actual source finding: ReactSettingsExtension writes fixed
`settings.rootDirectory/build/generated/autolinking/autolinking.json`;
ReactExtension reads
`rootProject.layout.buildDirectory/generated/autolinking/autolinking.json`. Own
native `android/build/generated/autolinking/autolinking.json` exists (11,975
bytes). Thus moving root/app build outputs broke lookup; preserving their
already owned Android paths while redirecting external dependency projects is
the proposed correction. Full source relay remains requested for independent
producer review.

At 21:12:57 UTC new `owned-build-outputs-successor.gradle` and
`isolated-build-output-routing-runner.cjs` were prepared. Init preserves every
project directory inside owned Android, redirects outside projects to
administrative hashes, logs initial/final project-output mappings, accepts only
owned Android/admin boundaries and guards all declared task outputs. Separate
runner preserves old evidence, uses a fresh liveness proof, the same verified
direct Java/offline/minimal-environment/fingerprint setup, maximum 720 seconds
and cutoff **21:27 UTC** for three minutes of report time. Timeout targets only
its still-live owned Java tree. Execution/result pending; no APK claim.

## Approved continuation — 2026-10-07 20:07 UTC

Owner approved a separate 90-minute continuation, overall hard stop 21:37 UTC.
This runtime slice has checkpoint 20:40 and **hard task report 21:10 UTC**;
initial ETA 45–60 minutes. Prior overrun/failure evidence below remains intact.
Runtime/admin artifacts and this checklist only are owned here; production/test
authors retain source ownership. No shared/hosted/provider operations or app
launch are authorized by readiness alone.

Full fresh audit `primary-pool-continuation-audit.json` at 20:08:48.237 UTC:
Normal ChatGPT authors cannot operate local runners; OpenCode version 1.18.29
works but its stopped safe-source/session failure remains unresolved;
Antigravity has no callable CLI/MCP worker surface. Existing exact owned
container ID/image and loopback publication are reverified running; exact
`Monyvi_Issue347_API34` name is reverified on `emulator-5560`. Repository
identity/status remain lead-brokered; no native source exploration fallback.

At 20:18 UTC, ignored staging/native generation and dedicated
extension/session/preload controls were proposed to the lead for guarded
execution. **These proposals are not execution evidence.** Synthetic auth/role
bootstrap waits actual migration prerequisites. The app remains gated on
isolated Supabase HTTP/auth/fixtures; bare Postgres cannot satisfy that gate.
Maestro stays blocked until fresh evidence justifies a changed route; prior
failed invocations will not be blindly repeated.

### Continuation execution evidence

Fresh `continuation-staging-guards.json`, 20:19:11.111 UTC: mobile branch
`codex/issue347-mobile`, pinned HEAD `ac1ef5583656190d04f3d068a742d98f742085cf`;
expected eight test/YAML-only changes; ignored staging and native directories
absent; original four tracked fingerprints unchanged; ports 54331/8082 free.
Lead created only the proposed ignored staging/junctions and launched prebuild
at 20:22:40 UTC (owned runner PID 15616, 180-second bound, minimal synthetic
environment). Prebuild result and source-hash equality remain pending; no
Android copy/build/install/app launch is claimed.

`isolated-db-test-extensions.json`, 20:23:53.976 UTC, exits 0 after exact target
guards. pgcrypto 1.3, pgTAP 1.3.3 and dblink 1.2 are now installed on the
dedicated database. Actual pgTAP `plan(1)` control returns
`ok 1 - isolated pgTAP control`, with `finish()` empty. Actual outer backend PID
41412 and dblink backend PID 41414 differ (`distinct_backends=true`). This
proves working test/session controls, not Voice quota or concurrency behavior.
Feature SQL is not applied. pg_cron preload/restart proof remains pending.

Actual base prerequisite source is `002_complete_schema.sql` (with existing 001
market rates and 003 category colors), not the initially guessed nonexistent
initial-schema path. Its reviewed auth requirements include `auth.users.id`,
signup `raw_user_meta_data`, UUID-returning `auth.uid()` and named
anon/authenticated/service_role policies. Additional helper/trigger references
are being checked before auth-only bootstrap; no public/base/Voice migration has
been loaded by this slice.

First continuation prebuild attempt completed 20:23:26.522 UTC: exit 1 after
45.525 seconds, all four tracked hashes unchanged, no native project generated.
`isolated-prebuild-proof-relay.json` preserves full result/logs. Expo
interpreted the absolute Windows archive argument as
`https://github.com/E:/.../template.tgz` and rejected its structure before
download. Installed `cloneTemplateAsync` source confirms explicit file-type
templates extract locally. One corrected relative archive argument was proposed,
conditional on verifying the actual argument parser selects file type and the
relative path resolves to the exact cached template; no clean/delete or source
edits. This is setup failure, not feature Red.

`isolated-db-cron-proof.json`, 20:30:03.572 UTC, exits 0 after guarded owned
preload configuration/restart. Actual settings:
`shared_preload_libraries=pg_cron`, `cron.database_name=monyvi_voice_qa347`;
pg_cron 1.6.4 installed alongside the three previous extensions; `cron.job` has
zero scheduled jobs. This proves scheduler readiness only. No cleanup job or
Voice migration is installed.

`isolated-prebuild-attempt2-started.json`, 20:30:40.596 UTC, records actual
installed argument parsing of
`../../../../../Monyvi/node_modules/expo/template.tgz` as `type=file`, resolving
to the exact existing cached archive. Corrected attempt uses owned runner PID
51392 and 180-second bound; result pending. Source/Gradle/config drift
assessment is now a separate gate because lead detected remote main
`758e0583c069d0af30681f7cff7e702bfabd845a` versus earlier governing
`2095ec061d531854603e8415122231f1cbf4c1a0`; pinned feature/workers remain
`ac1ef5583656190d04f3d068a742d98f742085cf`. No Android copy/build proceeds until
lead resolves that gate.

Lead subsequently assessed main drift: changes are PR337 Metals Delete
UI/services/tests plus private shell and logic barrel; no
package/app-config/plugin/Gradle/Voice source/governing workflow changes,
migrations still 081. Prepared no-commit merges preserve authored uncommitted
work. Extra merge-index status is expected and must not be attributed to this
runtime slice. Android source/config fingerprints are unchanged, so lead cleared
the drift gate; actual successful generation/hash proof remains required before
copy/build.

Checkpoint preview at 20:39 UTC: exact owned attempt2 runner was read as
administrative relay to identify its output filenames, then full
`isolated-prebuild-attempt2-result.json` and stdout/stderr were consumed.
**Corrected prebuild succeeded**, exit 0, 20:30:40.766–20:31:46.438 UTC (65.672
seconds). Native Android directory generated in ignored staging; all four
original tracked fingerprints unchanged. Stdout reports created native
directory, package update with no changes and completed prebuild; stderr empty.
No package install, app launch or provider operation occurred. Guarded
Android-only copy/path review is next; APK build/install remains unexecuted at
this checkpoint.

`isolated-generated-gradle-source.json`, 20:38:55.421 UTC, records successful
Android-only copy after exact exit/hash/ignored/resolved-path guards. Full final
settings/root/app Gradle, properties and wrapper files were read. App root is
calculated from the final Android parent; namespace/application ID are
`com.monyvi.app`; wrapper is 9.0.0, already cached; scoped scan finds no staging
path. Settings and app code resolve installed Node/autolinking at runtime.
SDK/NDK versions are delegated to the installed Expo root plugin. No APK is yet
claimed.

Proposed single offline build uses cached Gradle, no daemon/download/install,
x86_64 only, a 420-second bound, minimal public environment, owned project cache
and an administrative init script that relocates build outputs and rejects
declared task outputs outside owned runtime/Android directories. Shared
dependency source remains read-only; incompatible output routing or missing
offline artifacts must be reported, not bypassed or downloaded. Execution/result
remains pending.

Full `isolated-image-auth-sources.json` at 20:39:55.982 UTC was read: cached
image initial-role and auth-schema SQL provides exact
anon/authenticated/service_role flags, auth.users fields and auth.uid/role/email
bodies. Minimal auth-only bootstrap was proposed, omitting publication,
superuser/auth-server roles, refresh/session tables and all public/Voice
migrations. Legacy cached `auth.uid()` reads `request.jwt.claim.sub`; repository
tests set that claim explicitly. JSON-only claim behavior and current full
GoTrue migration compatibility are not proven by this minimal bootstrap. App
HTTP/auth gate remains closed. Bootstrap execution/result pending.

At 20:40 the lead released one focused server verification batch and
`server-first-green.md` evidence to this QA role for four externally authored
production files. This grants execution/evidence ownership only; implementation
ownership remains external. Its results will be recorded separately; missing
migration structural checks or skipped tests cannot be reported as full server
Green.

`isolated-auth-bootstrap-result.json`, 20:50:48.214 UTC, exits 0 with empty
stderr. Actual script rejected incompatible identities/objects before creation,
then installed only auth users/schema/helper definitions and source-verified API
role/default-grant setup. Signed-out, synthetic UUID, authenticated-role UUID
and cleared-claim assertion controls completed without exception;
`auth controls passed`; control transaction rolled back. Readback proves
intended database/postgres user, anon/authenticated
`NOLOGIN NOINHERIT NOBYPASSRLS`, service_role `NOLOGIN NOINHERIT BYPASSRLS`, all
21 cached users fields and faithful legacy uid/role/email helper bodies. No
public application or Voice table/migration, auth HTTP server, real
session/token or app fixture is established by this bootstrap.

Lead launched the single offline build at 20:50:52 UTC, owned runner PID 10600,
420-second bound, cached Gradle 9.0 via hidden PowerShell normal batch launcher,
owned output-routing init script and minimal public environment. Exact package
fingerprints are captured around execution. Full
`isolated-build-result.json`/stdout/stderr will determine build readiness; no
retry/download/source change or APK installation/app launch is authorized by a
pending run.

Build capture anomaly: full `isolated-build-result.json`/stdout/stderr were
consumed. Result records 20:50:52.796–20:50:54.139 UTC (1.343 seconds), shell
exit 0 and all four tracked hashes unchanged; both output logs are empty. There
is no Gradle success marker or APK evidence, and installation/launch flags are
false. **Actual Gradle execution/build success is unproven.** This is a
launcher/capture setup gap, not an offline dependency failure or behavioral Red.
Lead was asked for the exact owned runner/PowerShell source and read-only APK
metadata; no repeat is authorized until the actual invocation/exit boundary is
diagnosed. Any justified correction must preserve original logs and the 21:10
task report bound.

Full `isolated-build-launcher-diagnostic.json` was read: the owned PowerShell
source uses synchronous invocation and exit propagation, so detached
Start-Process is not evidenced. APK scan is empty. Actual cached batch source
identifies its 64 MiB JVM options, instrumentation agent, empty classpath and
`gradle-gradle-cli-main-9.0.0.jar` entrypoint.
`isolated-gradle-direct-version.json` at 20:59:27.126 UTC proves the direct Java
route exits 0, printing actual Gradle 9.0.0 and JDK 17.0.12. The batch/capture
failure's precise cause remains unresolved; direct invocation is a source-proven
alternative.

Administrative `isolated-build-direct-runner.cjs` was authored at 21:01 UTC
under explicit lead request, without source edits. It requires a fresh
lead-verified no-prior-owned-build liveness artifact, uses exact cached Java
launcher arguments plus the unchanged offline/output-guard build, records the
live owned Java PID and streams separate logs. Timeout ceiling is 420 seconds,
reduced dynamically to stop at 21:08:30 UTC, reserving report time. Timeout
targets only that still-live owned Java process tree; no foreign process is
stopped. Direct build execution/result is still pending at this snapshot.

### Continuation final build result and handoff

Report clock **21:09:06 UTC**; elapsed **62m06s** from continuation start 20:07
UTC, within the 21:10 task report bound. Runtime work ended at the completed
direct attempt; remaining time was evidence review/writing only.

Direct actual build completed **21:06:57.315 UTC**, exit 1, null signal, **not
timed out**, elapsed **259.506 seconds** from 21:02:37.809. Full direct
result/stdout/stderr read by 21:08:16 UTC. All four tracked fingerprints remain
unchanged; app installation/launch flags false. No third attempt, download or
source correction follows this result.

Actual Gradle compiled included plugins: 36 actionable tasks, 24 executed/12
up-to-date. Own administrative artifact metadata proves fresh Expo autolinking,
max-SDK override, React Native, dev-launcher, module and updates plugin JARs
under the hashed owned build root. Earlier shared/settings plugin JAR timestamps
precede this direct run and postdate the first empty PowerShell capture, so the
first record did not establish the entire actual artifact lifecycle. The
original batch capture cause remains unresolved; fresh 21:02:37 liveness proof
found no prior owned descendant/candidate before the direct run. Positive owned
output evidence covers listed compiled artifacts, not every possible undeclared
side effect.

Actual configured versions: build-tools 36.0.0; min SDK 24; compile/target SDK
36; NDK 27.1.12297006; Kotlin 2.1.20; KSP 2.1.20-2.0.1. Installed SDK/NDK
metadata already matches the required Android versions. **No APK readiness is
claimed.**

Failure is runtime output-routing/autolinking setup: evaluating generated
`android/app/build.gradle` line 63 cannot find
`<admin>/isolated-runtime/gradle-build/17360ee513165951fd457d9aefa9368ace491b818a624d06722f9384d7f10e59/generated/autolinking/autolinking.json`.
Root/app output relocation changed the location later consumed by React Native
after settings-level autolinking. This is not a Voice production defect or
behavioral Red. A successor should verify the actual generated JSON location,
preserve root/app build directories within the already owned Android tree,
relocate only projects outside that tree, and retain declared-output guards
before one newly authorized bounded build. That is a proposal only; no guard
bypass or retry was performed here.

Attainable prep is complete: dedicated API34 emulator, owned generated Android
project, cached direct Gradle route, dedicated SQL identity/locale,
pgTAP/dblink/session controls, pgcrypto, pg_cron preload/zero-job state and
minimal legacy auth-role/helper controls. Remaining blockers: APK/autolinking
runtime routing; Maestro usability; fully isolated current Supabase HTTP/auth
and synthetic application fixtures; actual Voice SQL/quota/race coverage and
native journeys. Main/shared device/runtime/provider targets remain outside this
task. No app launch/provider call/commit/push occurred.

Runtime/application ownership is released to the lead with preserved targets,
logs, administrative helpers and this evidence. Separate server first-batch
results are complete in `server-first-green.md`: 36 tests, 31 pass, 1 structural
bootstrap absence, 4 skips; implementation ownership stayed external. No further
runtime action is pending from this QA assignment.

## Prior closeout — runtime stopped

Report clock: **17:05:41 UTC**; elapsed **75m41s** from 15:50 UTC, **15m41s**
beyond the 16:50 hard bound. The last minutes were stopped evidence
review/writing only; no runtime continuation.

Finalization snapshot: **2026-10-07 17:03:19 UTC**. Assignment began 15:50 UTC;
elapsed **73m19s**, including stopped evidence closeout. Hard report was 16:50
UTC: **13m19s overrun** at this snapshot. Lead stopped affected runtime work at
its 16:56 UTC broker checkpoint. No extension, staging, prebuild, build, Metro
or app actions followed that stop. No hidden continuation is authorized.
Existing targets are preserved; runtime/application ownership is released to the
lead after this report. Any continuation needs a separately bounded assignment.

Earlier sections below are historical discovery/proposals. This closeout
supersedes their pending capability labels without erasing failed attempts.

| Target                   | Verified result                                                                                   | Remaining gate                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dedicated Android target | `Monyvi_Issue347_API34`, explicit `emulator-5560`, Android 14 / API 34, boot completed            | No APK installed, build generated, Metro started or app launched                                                        |
| Dedicated SQL target     | `monyvi-issue347-postgres`, loopback `127.0.0.1:54332`, intended synthetic database/user verified | Test extensions, second backend/session proof, scheduler preload, schema/bootstrap and feature SQL absent               |
| Maestro                  | Installed launcher exists; batch launcher fails; direct Java invocation timed out                 | Runner usability unproven; no Maestro journey executed                                                                  |
| Native build             | Installed SDK/JDK/Gradle/local Expo template exist                                                | Offline ignored staging is only proposed; generated Gradle/autolink paths and actual build not verified                 |
| App integration          | Dedicated device is empty of `com.monyvi.app`                                                     | Standalone Postgres supplies no Supabase Auth/REST/Edge endpoint; isolated synthetic auth/data fixtures remain required |

### Created Android target and actual boot proof

Root creation evidence `isolated-emulator-created.json` timestamp 16:07:11.231
UTC records owned launcher PID 30492. Fresh AVD data/config lives only under
`E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/isolated-runtime/avd`.
Installed `system-images;android-34;google_apis;x86_64` was used; no download or
personal AVD/userdata cloning. `avdmanager` is absent, so an authorized fresh
minimal AVD configuration was written. Console/ADB ports are 5560/5561.

Boot command:
`C:/Users/Mohamed/AppData/Local/Android/Sdk/emulator/emulator.exe -avd Monyvi_Issue347_API34 -port 5560 -no-window -no-snapshot -no-boot-anim -gpu auto`.
SDK/AVD scope was explicit; process/logs are owned administrative artifacts. PID
30492 identifies the launcher, not every child process.

First proof saw ADB offline during early boot. This was not a feature failure.
`isolated-runtime-second-proof.json` at 16:12:25.916 UTC then proved, using
absolute ADB with explicit `-s emulator-5560`: get-state exit 0 `device`; AVD
name exit 0 exact name; Android release 14, SDK 34 and `sys.boot_completed=1`.
Fingerprint:
`google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.050/12077443:userdebug/dev-keys`.
`shell pm path com.monyvi.app` exited 1 with empty output, proving app absence
at that snapshot. No APK installation, launch, taps, permission manipulation,
reset/seed, audio or provider activity occurred.

### Dedicated database failure, recovery and query proof

Creation at 16:06:46.887 UTC used locally cached amd64 Supabase Postgres
17.6.1.134, immutable image
`sha256:9faa7279bcf1fd6834e65dc876b11e39cb53030bcb3d653beb7e5668200acbb5`,
container ID `93f19dec6365deb2fc9ebc7d41a56c7438132bbab42419760e7c061b97ca3ce1`,
name `monyvi-issue347-postgres`, database `monyvi_voice_qa347`, synthetic
postgres authentication, fresh owned PGDATA and host publication exclusively
`127.0.0.1:54332`. No shared volume or image pull was used. Full creation
command is retained in the earlier proposal section.

Initial `initdb` and database creation succeeded. Image-specific
`/docker-entrypoint-initdb.d/migrate.sh` then failed because role
`supabase_admin` did not exist; container exited. The initial query failure was
runtime setup, not behavioral Red. Failed logs/container were preserved. Full
actual entrypoint source was copied from this owned container and read: existing
`$PGDATA/PG_VERSION` causes initialization scripts to be skipped on normal
restart. After exact container/image/loopback guards, one normal
`docker start monyvi-issue347-postgres` succeeded. No entrypoint patch, invented
Supabase admin role, feature migration or shared database operation was used.

Read-only closeout `isolated-postgres-closeout-proof.json`, 17:02:55.689 UTC,
exited 0. Query evidence: `current_database=monyvi_voice_qa347`,
`current_user=postgres`, backend PID 1286, PostgreSQL 17.6 x86_64, timezone UTC,
`datcollate/datctype=en_US.UTF-8`. `pg_available_extensions` lists pgTAP 1.3.3,
dblink 1.2 and pg_cron 1.6.4; all `installed_version` values are empty.
`shared_preload_libraries` is empty. One backend PID is not genuine
concurrent-session evidence. No extension creation, pgTAP smoke, dblink session,
pg_cron preload/schedule, auth/role bootstrap or Voice SQL was applied. Local
authentication enforcement beyond this successful synthetic TCP query was not
independently audited.

The SQL proof command used `docker exec` for the exact owned container and
`psql -X -h 127.0.0.1 -p 5432 -U postgres -d monyvi_voice_qa347 -v ON_ERROR_STOP=1`,
with the synthetic password scoped to that invocation; it selected
identity/version/timezone, database locale, available extension versions and
preload setting. It did not mutate SQL data or configuration. Raw PostgreSQL is
not a Supabase HTTP endpoint; shared Kong 54321 was never bound to the app.

### Maestro and build boundary

`C:/maestro/bin/maestro.bat --version` with explicit JDK environment exited 1:
`The syntax of the command is incorrect.` Full launcher inspection identified
its nested cmd Java-version quoting. One durable alternative invoked
`C:/Program Files/Java/jdk-17/bin/java.exe --enable-native-access=ALL-UNNAMED -classpath C:/maestro/lib/* maestro.cli.AppKt --version`;
it timed out after 25 seconds with zero output. No repeated batch invocation or
further repair loop followed. Maestro installation/version metadata does not
prove an executable runner.

Installed Expo CLI source inspection found that `--no-install` suppresses
dependency installation but still permits `updatePackageJSONAsync` to rewrite
project package scripts/dependencies. `--skip-dependency-update` is not a
blanket tracked-write guard. Explicit local `--template` selects cached
extraction; default template resolution can fall back to downloading.
Environment loading also requires `EXPO_NO_DOTENV=1` for private-env isolation.

The lead authorized a proposed ignored staging root
`E:/Work/My Projects/Monyvi-issue347-mobile/apps/mobile/.expo/issue347-native-prebuild`:
copy only known package/app/index inputs; link known assets/plugins; use the
verified local template, no install and synthetic public environment; compare
captured tracked fingerprints; copy only generated Android output into the
absent ignored worker Android directory; then inspect generated
Gradle/autolinking paths before any offline build. **None of these
staging/prebuild/copy/build steps executed before the stop.** No generated APK,
ignored Android project or own Metro listener is claimed. The proposed synthetic
HTTP URL on 54331 was intentionally unreachable, not an app-ready backend.

### Handoff and safe next slice

Both owned targets remain available for a future explicitly bounded
continuation. Preserve their exact names/IDs/serials and revalidate identity
before any later mutation. A successor can complete extension/session/scheduler
readiness on the owned database and resolve Maestro/build capability, then
establish a fully isolated Supabase HTTP/auth/fixture target before any native
app journey. No feature quota/race, Manual persistence, modes journey,
permission, background, recording or live-provider result follows from this
readiness evidence.

Main repository source, shared phone, shared Metro 8081, shared Supabase
database 54322/Kong 54321 and other chat processes remained untouched. No
production/config/migration/type edit, install, feature test run,
hosted/provider call, commit or push occurred in this runtime assignment.

## Output-routing successor closeout — 2026-10-07 21:19 UTC

- Assignment: separate approved runtime-only slice, start 21:11 UTC; hard report
  21:30 UTC, overall owner bound 21:37 UTC. Exactly one offline successor build;
  no production/test source changes, download, installation, or app launch.
- Independently read the full installed ReactSettingsExtension.kt and
  ReactExtension.kt administrative relay. Settings generates
  Android/build/generated/autolinking/autolinking.json; the app reads
  rootProject.layout.buildDirectory/generated/autolinking/autolinking.json. The
  new runtime-only init script keeps all project directories inside the owned
  Android tree at their generated build paths and redirects external dependency
  project outputs to owned administrative hashes. It records project mappings
  and rejects declared task outputs outside those two boundaries. This is a
  declared-output guard, not proof of every possible undeclared side effect.
- Preserved prior failed logs, original init, and original runners.
  Administrative successor files:
  isolated-runtime/owned-build-outputs-successor.gradle and
  isolated-build-output-routing-runner.cjs. Source/config fingerprints and
  minimal synthetic public environment remain guarded; private environment files
  are not loaded. The Supabase HTTP URL stays intentionally unbound at
  port 54331.
- Initial PID-only liveness check correctly refused launch because old Java PID
  63424 had been reused by a foreign Docker process. No process was killed.
  Fresh generation-aware proof at 21:15:09.830 checked process name/creation
  generation and original launch-window descendants; no prior owned Java build
  remained. Root runner 34852 launched owned Java PID 61468 at 21:15:10.144,
  with a 709853 ms bound cutting off at 21:27 UTC.
- Actual result: completed 21:17:58.288, exit 1, signal null, timedOut false,
  elapsed 168.144 seconds. All four captured tracked fingerprints stayed
  identical. The log confirms owned Android root output android/build and React
  Native/Expo included-project output mappings inside the administrative
  gradle-build hashes. Root assembly did not reach a completed application
  build.
- Fatal setup blocker: Android root build.gradle line 24 fails applying
  com.facebook.react.rootproject because the Gradle-transformed
  expo-updates-gradle-plugin.jar cannot find
  expo.modules.updates.ExpoUpdatesPlugin. Its earlier jar task warned that the
  plugin descriptor existed but the implementation class did not. The current
  blocker is a plugin output artifact failure, not a Voice behavioral test
  failure. A shared-cache cause is not established. The old autolink consumer
  lookup was not reached in this successor; the source-proven routing fix is
  prepared, but successful autolink lookup is still unverified.
- Evidence: isolated-build-output-routing-prior-liveness.json,
  isolated-build-output-routing-started.json,
  isolated-build-output-routing-result.json,
  isolated-build-output-routing-stdout.log,
  isolated-build-output-routing-stderr.log, and
  isolated-autolink-producer-consumer-source.json in the owned Git
  administration directory.
- No APK was produced by this attempt; no install/app launch/Metro launch/device
  journey/provider request occurred. Earlier dedicated emulator and DB readiness
  remain available, but isolated Auth HTTP/application fixtures and a working
  Maestro runner remain unproven. Bare Postgres readiness does not establish
  native application API readiness, Voice quota/replay/concurrency, or E2E
  behavior.
- Safe future diagnostic slice, requiring a separately released bounded
  assignment: inspect the cached Expo Updates compile destination, owned plugin
  jar contents, and transformed jar identity against the installed Gradle plugin
  source/output declarations. Do not remove caches, download dependencies,
  modify installed source, or rerun assembly without a concrete new
  source-backed fix. Preserve the owned targets and all failed logs.

### Independent focused parser Green readback

Read complete mobile-t037-first-green-output.txt, exit.json and results.json.
Actual runner 21:05:15.666–21:07:05.987 UTC, exit 0/null signal, elapsed 110.321
seconds. One suite, 30 passed/30 total; zero failed, pending, runtime-error or
interrupted tests. Assertions include stable caller-provided request key,
independent caller timezone, Voice availability with every SMS AI capability
disabled, FormData/URI behavior, privacy-safe errors, consent, schema/amount
normalization, abort timeout and date fallback controls. This confirms parser
metadata/control tests only; hook metadata acquisition, end-to-end quota/replay
and full type/feature Green remain outside this result.

The batch emitted a nonfatal jest-haste-map @monyvi/mobile package-name
collision: real apps/mobile/package.json versus the owned ignored
.expo/issue347-native-prebuild/package.json. This staging artifact should be
preserved by a guarded rename to a non-package evidence filename after any
remaining generation dependency is ruled out, rather than changing tracked Jest
configuration. No cleanup mutation or test rerun was performed by this QA
worker.

### Successor ownership release

Report clock 2026-10-07 21:24:19 UTC; elapsed 13m19s from separate start 21:11
UTC, before hard report 21:30 and overall stop 21:37. Runtime execution ended at
21:17:58.288; remaining work was bounded read-only evidence review. The one
authorized successor build is complete and failed as a setup blocker. No build
retry or runtime mutation is pending from this worker. Preserve dedicated
targets and all administrative logs/helpers; application/evidence ownership
returns to the lead. Optional bounded owned plugin-jar inspection was received
and read completely; exact positive contents are recorded below, with
class-destination/root cause still unproven. Main/shared targets and external
production/test author ownership remain untouched.

### Positive owned plugin artifact diagnosis

Full isolated-updates-owned-jar-diagnostic.json read independently. Probe
timestamp 21:21:04.569 UTC; exact owned updates plugin hash
51f034523a1decf86a86d6c64a491b05584fe52d91b0c3efdd9a39e8dfd9067a/libs/expo-updates-gradle-plugin.jar
is 640 bytes, modified 21:16:39.679. Absolute installed JDK jar.exe tf exits 0
and lists only META-INF, MANIFEST.MF, gradle-plugins directory and
expo-updates-gradle-plugin.properties; **zero compiled classes**. Full installed
build.gradle.kts declares Kotlin JVM 2.2.0 plus java-gradle-plugin and the
required implementationClass expo.modules.updates.ExpoUpdatesPlugin, with JVM
target/source/target11 and no custom output-path configuration. Thus the owned
jar itself lacks the required implementation, independently of Gradle's
transformed copy. This proves the immediate artifact failure; it does not prove
its compile-destination, relocation/caching root cause or corruption of any
shared cache. No cache deletion, dependency/source change, download or
additional build follows this diagnosis. A future separately assigned diagnostic
should inspect actual Kotlin task destinations/class outputs and source-set
wiring before any proposed correction.
