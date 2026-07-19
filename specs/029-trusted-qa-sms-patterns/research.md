# Research: Trusted QA SMS Pattern Intake

## Decision: Use a doubly guarded development-only mobile tool

**Decision**: The intake route and its services require both `__DEV__` and an
explicit `EXPO_PUBLIC_ENABLE_QA_SMS_PATTERN_INTAKE=true` flag. The route renders
no intake content and services reject calls when either guard is absent.

**Rationale**: Android SMS access is available only inside the app process. A
desktop-only script cannot honestly provide message selection and sanitization
on an ordinary physical device. Two guards prevent the tool from becoming an
accidental normal-development or release feature.

**Alternatives considered**:

- A desktop/ADB inbox reader: rejected because ordinary Android devices do not
  expose SMS provider data to desktop processes safely.
- Reuse the production SMS scan screen: rejected because scan semantics,
  consent, parser orchestration, and review/save behavior must remain unchanged.
- A production contribution screen: deferred to Phase 2B.

## Decision: Authorize before listing and select before sanitizing

**Decision**: The operator first accepts a bounded QA authorization statement.
Only then may the tool query a limited QNB inbox view. Message bodies stay in
memory for local selection; candidate processing begins only for checked rows.
Closing, backgrounding, or resetting the tool clears raw selections and drafts.

**Rationale**: The operator must see enough local information to choose the
correct messages, but inbox visibility must not silently become consent to
process or export every message.

**Alternatives considered**:

- Process all QNB messages automatically: rejected because authorization is
  message-selective, not broad inbox collection.
- Persist a draft inbox cache: rejected because it creates an unnecessary raw
  SMS copy.

## Decision: Represent sanitized content as structured segments

**Decision**: Sanitization produces an ordered list of fixed-text segments and
typed placeholders rather than a freely editable string. Canonical placeholders
are `CURRENCY`, `AMOUNT`, `BALANCE`, `LAST4`, `ACCOUNT`, `REFERENCE`,
`MERCHANT`, `PERSON`, `PHONE`, `DATE`, and `TIME`. Display text such as
`<AMOUNT>` is derived from the segments.

**Rationale**: Structured segments preserve placeholder identity, make boundary
corrections testable, prevent arbitrary edits from bypassing validation, and
support deterministic family signatures in Phase 2B and Phase 2C.

**Alternatives considered**:

- Regex replacement into one string: rejected because corrections can leave
  hidden raw values and placeholder meaning is lost.
- Free-form template editing: rejected because post-export edits would not have
  trustworthy provenance.

## Decision: Use layered fail-closed privacy validation

**Decision**: Before approval or export, validation checks the artifact schema,
allowed sender alias, placeholder completeness, forbidden numeric/account/phone/
email/date/time patterns in fixed text, unsupported placeholder types, raw IDs,
and forbidden metadata keys. Merchant/person spans require explicit operator
classification. Any correction invalidates prior approval and reruns every
validator.

**Rationale**: No deterministic sanitizer can infer every human name or merchant
from one message. Layered automation plus explicit local review is safer than
pretending the problem is fully automatic.

**Alternatives considered**:

- Automatic sanitization without operator review: rejected because repeated
  customer names and unusual references can evade generic detectors.
- Trust operator review without automated checks: rejected because long numbers,
  dates, and phone/account fragments are reliably machine-detectable.

## Decision: Derive duplicate evidence identity without exporting app fingerprints

**Decision**: The mobile intake service creates a random, device-local evidence
secret and keeps it in secure device storage. It computes an evidence digest by
hashing a domain separator, that secret, and the existing SMS fingerprint. The
exported value is not the secret, transaction `smsFingerprint`, device SMS ID,
sender, body, or timestamp. Catalog validation rejects duplicate evidence
digests within and across imported candidate bundles.

**Rationale**: The same source message must not inflate evidence count, while
the artifact must not expose a business deduplication key that could be joined
against app data.

**Alternatives considered**:

- Export the device SMS ID: rejected as a device-specific identifier.
- Export or merely re-hash the existing `smsFingerprint` without a local secret:
  rejected because it permits avoidable cross-context correlation.
- Random IDs only: rejected because the same message could be imported twice.

## Decision: Export one validated JSON bundle through local document storage

**Decision**: One explicit export action creates a deterministic JSON bundle of
approved candidates through Android Storage Access Framework. The operator
chooses the local directory, inspects the file, and manually transfers it. No
clipboard, share sheet, background upload, analytics payload, or network client
is involved.

**Rationale**: `expo-file-system/legacy` already provides the Android directory
picker, file creation, and string-write APIs required by the installed Expo SDK.
The flow satisfies the clarified local-artifact handoff without adding a new
dependency.

**Alternatives considered**:

- Clipboard: rejected because clipboard history and other apps can retain data.
- Share sheet: rejected because remote destinations cannot be prohibited.
- Automatic development upload: deferred to a later explicitly consented phase.

## Decision: Keep candidate data physically separate from active patterns

**Decision**: Sanitized QA artifacts and derived families live under a dedicated
candidate directory and are validated by a dedicated governance API. The active
`LOCAL_SMS_PATTERNS` export does not import this directory. Phase 2A candidate
metadata is always review-only, `autoSelectPolicy: never`, and unavailable to
all parser modes.

**Rationale**: Metadata flags alone are easier to misuse than a one-way module
boundary. Physical separation makes production activation an explicit later code
change reviewed under Phase 2C.

**Alternatives considered**:

- Add `candidate` entries directly to `LOCAL_SMS_PATTERNS`: rejected because a
  filtering regression could make them executable.
- Generate active regex rules during export: rejected because reviewed template
  promotion is not part of Phase 2A.

## Decision: Build families from exact structural signatures

**Decision**: The family signature includes normalized verified sender alias,
provider, fixed segments, placeholder sequence and roles, direction or rejection
outcome, and semantic family. EGP and USD share a family only when currency is
the sole variable and all other semantics are identical. Evidence and tests are
tracked per supported currency.

**Rationale**: Exact structural grouping follows the declared-template parser
model and avoids broad keyword inference.

**Alternatives considered**:

- Keyword similarity clustering: rejected because promotions and transactions
  share financial vocabulary.
- Always split currency: rejected as unnecessary duplication for identical
  structures.
- Infer USD support from EGP evidence: rejected by the clarification decision.

## Decision: Use explicit review-only lifecycle states

**Decision**: Samples move from `draft` to `blocked` or `validated`, then to
`approved` and `exported`. Catalog candidates move from `candidate` to
`review_ready` only after three non-duplicate matching samples, human approval,
and passing positive, near-match, and negative tests. There is no Phase 2A
transition to `trusted_production`.

**Rationale**: The lifecycle reflects the difference between stable structure
and provider-wide trust. Independent corroboration is deferred to Phase 2B or
Phase 2C.

**Alternatives considered**:

- Promote three same-device samples to production trust: rejected by the
  clarification session.
- Use one generic approved state: rejected because sanitization approval and
  family review readiness are distinct decisions.

## Decision: Automate deterministic paths and keep native evidence manual-only

**Decision**: Pure sanitization, validation, grouping, governance, mobile
service orchestration, hook state, and fixture-backed route behavior receive
unit, component, and integration coverage. The complete internal operator
journey, Mohamed's real inbox, and the Android document picker remain explicit
manual QA scenarios.

**Rationale**: This route is an internal development tool rather than a
production user journey. Its dedicated Maestro flow duplicated deterministic
component coverage, was sensitive to device/bootstrap state, and imposed more
maintenance cost than risk reduction. Physical-device QA proves the integrated
operator flow and native boundaries without representing synthetic fixtures as
real inbox validation.

**Alternatives considered**:

- Put real SMS into E2E fixtures: rejected because raw source messages must not
  enter source control or test artifacts.
- Maintain a dedicated fixture-backed Maestro journey: rejected because this
  internal workflow is better protected by deterministic lower-level tests and
  focused physical-device QA.
- Claim native E2E coverage using mocked private state: rejected as dishonest
  user-path coverage.

## Decision: Implement the approved five-state compact Android flow

**Decision**: Use the approved mockup boards as the structural reference for
authorization, QNB message selection, sanitized candidate review/correction,
coverage review, and local export. Reuse Monyvi's existing PageHeader, Skeleton,
theme tokens, controls, typography, safe-area behavior, and light/dark modes.

**Rationale**: The flow keeps a privacy-sensitive internal tool understandable
without expanding it into a production contribution experience. Compact sticky
actions preserve list/review space, and explicit coverage/export states make
blocking safety conditions visible.

**Alternatives considered**:

- A single dense utility screen: rejected because authorization, raw selection,
  sanitization review, and export have different privacy boundaries.
- Reuse generated colors/device chrome literally: rejected because the mockups
  define structure while Monyvi's design system remains authoritative.
- Skip dark-mode implementation because the tool is internal: rejected because
  every app route must remain theme-compatible and testable.

## Decision: Keep pre-classification filters truthful

**Decision**: The selection sheet filters only literal EGP/USD occurrences and
selected/unselected state. Provider scope remains fixed to QNB. It does not
offer message-family or transaction-type filters because those values do not
exist until explicit operator classification.

**Rationale**: A family filter would either infer business meaning from raw text
or present a control that cannot truthfully filter the inbox.

## Decision: Group coverage visually without merging declarations

**Decision**: Render eight compact expandable groups. OTP and informational are
combined only at the visual-summary level; all nine semantic families and all
required currency scopes remain independent declarations and editable rows. The
scope editor is full-screen rather than a nested bottom sheet.

**Rationale**: Grouping reduces scanning cost without weakening the coverage
contract, while a full-screen editor avoids stacked-sheet interaction and gives
compact Android screens reliable safe-area space.

## Decision: Add canonical bundle tamper evidence

**Decision**: Store a SHA-256 digest of canonical sanitized bundle content and
recompute it at export, staging scan, and import.

**Rationale**: This catches accidental or stale file edits across the manual
transfer boundary. It is deliberately not described as authentication: anyone
who can edit the bundle can also recompute an unkeyed digest.

## Decision: Evaluate templates only through a non-runtime QA matcher

**Decision**: Add a structural template evaluator under the QA intake testing
boundary. It may match sanitized test inputs to candidate families solely to
produce validation-case results. It is not exported from `@monyvi/logic` parser
barrels, cannot return `ParsedSmsTransaction`, and is covered by static runtime
isolation tests.

**Rationale**: Positive, near-match, and negative behavior must be demonstrated,
but making candidate families executable by the application would violate Phase
2A scope.

**Alternatives considered**:

- Record expectations without executing them: rejected because SC-005 would be
  unproven.
- Add candidates to the active local parser: rejected as a production/runtime
  boundary violation.

## Decision: Use ignored local staging for transferred bundles

**Decision**: The Android-exported file is manually placed under
`.local/qa-sms-intake/`, which is ignored by Git. Import commands reject paths
outside this root and write only schema/privacy-validated candidate outputs to
the source-controlled catalog.

**Rationale**: A distinct staging boundary prevents accidental commits of
unreviewed bundles and gives dry-run validation a predictable input scope.

## Decision: Preserve ATM terminal semantics without treating terminals as merchants

**Decision**: ATM names, descriptors, and identifiers use a dedicated
`ATM_TERMINAL` placeholder with `atm_terminal` semantics. Sanitization may
identify that dynamic value, but the operator still classifies the message
family explicitly. The terminal is optional candidate metadata and is not
persisted as a transaction merchant.

**Rationale**: Treating an ATM terminal as a merchant would create incorrect
evidence for Phase 2B and make structurally similar purchase and withdrawal
templates harder to separate. A dedicated role preserves meaning without
activating runtime parsing or retaining a private terminal value.

## Decision: Orchestrate repository ingestion on the host with one explicit command

**Decision**: Keep Android Storage Access Framework export as the device trust
boundary. After the operator transfers the selected JSON file to the host, one
`qa-sms:ingest` command validates the external file, copies it into ignored
staging, runs dry-run and atomic import validation, updates the candidate
catalog and coverage manifest, and runs privacy/governance verification.

**Rationale**: Android cannot write into the PC repository, and the device does
not have the current source-controlled catalog needed for duplicate and coverage
checks. A host command removes repetitive steps without creating an automatic
network/upload path or allowing the app to modify source files.

**Alternative rejected**: An app-to-Metro or app-to-host bridge was rejected
because it weakens the explicit local handoff, introduces a new transport for
sensitive evidence, and bypasses the repository-side trust boundary.

## Decision: Reuse the existing SMS permission recovery experience

**Decision**: The QA hook delegates permission status and recovery to the
existing custom SMS permission flow. Denied, blocked, or revoked permission
clears raw state and prevents inbox reads. No native permission request occurs
before the custom explanation action.

**Rationale**: This is shared app behavior and should not fork simply because
the route is development-only.

## Decision: Fail closed when the evidence secret is lost

**Decision**: A non-sensitive initialization marker distinguishes first setup
from later secure-secret loss. Secure-store read loss/corruption produces
`evidence_secret_unavailable`, clears drafts, and blocks export. Explicit reset
starts a new evidence domain only after an operator warning; the next import
requires acknowledged manual duplicate review.

**Rationale**: Silently generating a new secret would make prior duplicate
digests incomparable and could inflate evidence counts.

## Decision: Make the privacy scanner a normal quality gate

**Decision**: The candidate privacy/runtime-isolation scan runs from the root
verification command, pre-push hook, and CI, with tests written before the scan.

**Rationale**: A safety guardrail that runs only when remembered is not a
guardrail.
