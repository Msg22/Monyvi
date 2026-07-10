# Research: Local Intelligent Parser

## Decision: Phase 1 is dev/test local parsing, not production fallback

**Rationale**: The immediate problem is development and testing cost,
nondeterminism, and friction from calling the real AI provider. Phase 1 should
therefore make the local parser useful for local development, CI-friendly unit
and integration tests, and local-parser E2E flows. Production fallback requires
trusted real-message provenance, consented sample collection, and stricter
promotion governance, so it belongs in phase 2.

**Alternatives considered**:

- Build production fallback immediately: deferred because the first pattern
  catalog is fixture/dev oriented and should not be treated as trusted financial
  behavior.
- Keep only the existing exact fixture mapper: rejected because it does not
  exercise parser logic or future pattern governance.

## Decision: Dev/test patterns may be untrusted, but must be explicitly scoped

**Rationale**: For development and testing, fixture, synthetic, internet, or
unknown-source examples are acceptable because they are not user-facing
production behavior. The danger is accidental promotion. The catalog must encode
runtime scope, provenance, source confidence, auto-select policy, and promotion
eligibility so a reviewer can see whether a rule is dev/test-only, a candidate,
or trusted production material.

**Alternatives considered**:

- Require trusted real SMS sources before any phase-1 parser work: rejected
  because it blocks the dev/test value that motivated this feature.
- Allow untagged fixture patterns: rejected because it creates future
  production-risk ambiguity.

## Decision: Use template/pattern parsing, not broad keyword parsing

**Rationale**: Transaction SMS and promotional/informational SMS often share
words such as "card", "wallet", "transfer", "balance", "cashback", and currency
amounts. A broad keyword parser would eventually create false positives. The
local parser should use keywords only as an early candidate filter or as part of
a declared provider/template rule. A transaction suggestion can be created only
after a pattern rule matches and the parser can safely extract the required
transaction fields.

The internal parser flow should be:

1. Receive only existing SMS candidates, never the whole inbox.
2. Run negative filters for OTP, promotion, activation, failed transaction,
   statement reminder, marketing, and informational-only messages.
3. Match the candidate against the declared pattern catalog.
4. Extract amount, currency, movement direction, date/time, counterparty,
   card/account hints, ATM indicators, and category hints only from matched
   pattern rules.
5. Validate extracted fields and normalize them through existing logic helpers.
6. Assign confidence and review reasons.
7. Return the existing review-shaped transaction result.

**Alternatives considered**:

- Broad financial keyword parser: rejected because financial promotions and real
  transaction confirmations share vocabulary.
- AI-like heuristic parser for unknown senders/templates: rejected for phase 1
  because it would hide parser behavior behind guesses instead of deterministic
  fixtures.
- Exact string fixture mapper only: rejected because it is too narrow for the
  phase-2 parser architecture we want to grow into.

## Decision: Build a 100+ synthetic provider fixture corpus for phase 1

**Rationale**: Public research found that Egyptian provider pages commonly
confirm SMS alert, OTP, transfer, wallet, and payment-reference behavior, but
they rarely publish exact full transaction SMS bodies. Examples: Vodafone Cash
confirms deposit confirmation SMS and wallet transaction limits; e& money
documents transfer/cash-out behavior and fees; bank pages such as HSBC, Credit
Agricole, NBK, and QNB document SMS alert services; Fawry documentation
describes SMS payment-reference flows. Because these are behavior confirmations
rather than exact templates, phase 1 should generate a broad dev/test corpus
from provider-aware templates and mark the corpus as synthetic/untrusted.

The corpus must:

1. Include at least 100 concrete SMS-shaped fixtures.
2. Cover every selectable bank and wallet provider in the local institution
   registry.
3. Include payment-reference and non-transactional examples so the parser proves
   it does not invent transactions from OTPs or pay-code messages.
4. Keep every generated sample dev/test-only until phase 2 replaces or promotes
   individual templates with consented or provider-backed evidence.

**Alternatives considered**:

- Use only existing in-repo fixtures: rejected because it does not cover enough
  providers or scenarios.
- Treat public behavior pages as trusted exact templates: rejected because they
  do not publish exact SMS bodies.
- Wait for consented real SMS samples before expanding fixtures: rejected
  because phase 1 needs local/dev E2E realism now while phase 2 handles trusted
  collection.

## Decision: Put deterministic SMS parsing in `packages/logic`

**Rationale**: The parser is pure business logic: it receives candidate message
data plus a category map and returns normalized parser outcomes. Keeping it in
`packages/logic` preserves service-layer separation, lets Jest cover it without
React Native or WatermelonDB setup, and makes future reuse for already
transcribed voice text possible.

**Alternatives considered**:

- `apps/mobile/services`: rejected for the core parser because it would tie pure
  parsing to app runtime concerns.
- Supabase Edge Function: rejected because phase 1 needs offline/dev/test
  parsing without provider/network dependency.
- UI hook/component parsing: rejected by architecture rules.

## Decision: Add a mobile parser orchestrator instead of expanding scan/live callers

**Rationale**: Batch scan and live detection already orchestrate SMS reading,
deduplication, progress, consent checks, and save/review handoff. Adding parser
selection directly to both callers would duplicate rules. A focused
`sms-parser-orchestrator` can call the existing AI service, local parser, or
fixture parser according to runtime mode while callers keep the same
review-shaped output contract.

**Alternatives considered**:

- Put local mode inside `parseSmsWithAi`: rejected because the function name and
  current responsibility are specifically the AI parser client.
- Replace the fixture parser directly: rejected because fixture mode is an E2E
  harness with exact corpus behavior, while local parser mode exercises parser
  rules.

## Decision: Existing fixture mode remains separate from local-parser mode

**Rationale**: Existing `EXPO_PUBLIC_AI_SMS_PARSER_MODE=fixture` is
intentionally guarded for exact fixture lookup. The new local parser should have
a separate mode that exercises parser rules while still avoiding real AI calls.
This lets tests choose between exact fixture behavior and parser-rule behavior.

**Alternatives considered**:

- Reuse `fixture` mode for all local parsing: rejected because fixture mode is a
  corpus mapper, not a parser.
- Use AI in all tests: rejected due to cost and nondeterminism.

## Decision: Phase 2 owns trusted real SMS collection and production promotion

**Rationale**: Real user SMS examples require explicit consent, sanitization,
review, and a promotion workflow. Production-supported patterns should come from
consented user samples, QA real SMS, provider-published examples, or controlled
real transactions. Phase 1 should prepare metadata and validation so phase 2 can
add this safely later.

**Alternatives considered**:

- Store raw real SMS in source control: rejected for privacy.
- Promote internet/random templates to production behavior: rejected as
  untrusted.
- Build the consented collection workflow in phase 1: deferred to keep the first
  delivery focused.

## Decision: Local parsing follows the current AI transaction suggestions gate

**Rationale**: Phase 1 intentionally avoids changing feature access. Even though
local parsing does not contact an external provider, splitting the settings
model would change the product flow and require new consent copy, settings UX,
and E2E coverage. The local parser can be separated later if the product chooses
local-only suggestions as an independent capability.

**Alternatives considered**:

- Allow local parser while AI suggestions are disabled: deferred because it
  changes user expectations and settings semantics.

## Decision: Parser source is diagnostics-only

**Rationale**: Regular users should not need to reason about provider labels.
The review flow already communicates confidence and review reasons. Parser
source should be available in tests, QA diagnostics, and non-sensitive logs
without exposing SMS body, sender, amount, transcript, or response bodies.

**Alternatives considered**:

- Show "local parser" labels in the review UI: rejected as implementation copy
  that could reduce trust and add cognitive load.
