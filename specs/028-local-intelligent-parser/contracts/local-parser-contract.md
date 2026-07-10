# Contract: Local SMS Parser

## Purpose

Define the pure parser interface owned by `packages/logic`. The parser must not
import mobile services, WatermelonDB runtime objects, Supabase clients, React,
or platform APIs.

Phase 1 uses this parser for development and testing. Production local fallback
is explicitly deferred to phase 2.

## Input

```ts
interface LocalSmsParserRequest {
  readonly candidates: readonly LocalSmsCandidate[];
  readonly categories: readonly CategoryMapSource[];
  readonly supportedCurrencies: readonly string[];
}

interface LocalSmsCandidate {
  readonly messageId: string;
  readonly sender: string;
  readonly body: string;
  readonly receivedAtMs: number;
  readonly smsFingerprint: string;
}
```

Rules:

- Candidate bodies are raw SMS text but are in-memory only.
- The parser must process only candidates passed by the existing SMS filter.
- The parser must run negative classification before extraction so promotions,
  OTPs, failed transactions, activation notices, reminders, and informational
  messages do not become suggestions because they contain financial words.
- The parser must create suggestions only from declared provider/template rules,
  not from free-floating keyword matches.
- Invalid parser configuration returns an error result; it must not throw for
  normal unsupported messages.

## Output

```ts
interface LocalSmsParserResult {
  readonly transactions: readonly LocalParsedSmsTransaction[];
  readonly unsupportedCount: number;
  readonly error?: LocalSmsParserError;
}

interface LocalParsedSmsTransaction {
  readonly messageId: string;
  readonly smsFingerprint: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: "EXPENSE" | "INCOME";
  readonly counterparty: string;
  readonly date: Date;
  readonly categorySystemName: string;
  readonly confidence: number;
  readonly patternRuntimeScope: "dev_test" | "candidate" | "trusted_production";
  readonly reviewStatus: "auto_selectable" | "needs_review";
  readonly reviewReasons: readonly LocalReviewReason[];
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly parserSource: "local";
}
```

Rules:

- `confidence` must be clamped to `0..1`.
- Unsupported messages produce no transaction, not a fake low-confidence
  transaction.
- Phase-1 `auto_selectable` can be allowed only in local-parser dev/test mode
  and only when the pattern metadata permits `dev_only` auto-selection.
- `trusted_production` output is reserved for phase 2.
- ATM withdrawals must include `needs_review` unless a later approved business
  rule explicitly says otherwise.

## Error Semantics

Errors are reserved for parser/configuration failures, not unsupported message
templates.

Allowed error kinds:

- `invalid_categories`
- `invalid_supported_currencies`
- `catalog_configuration`
- `unknown`

## Privacy Contract

The parser must not log:

- SMS body
- Sender
- Amount
- User account names
- Full parser response bodies

Diagnostics may include non-sensitive counts, pattern IDs, runtime scope counts,
source type counts, and failure kind.
