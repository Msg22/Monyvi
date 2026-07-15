# Contract: QA SMS Candidate Artifact

## Purpose

Define the only data allowed to leave the QA device in Phase 2A. The contract is
validated at export and again when an artifact is imported into the candidate
catalog.

## Bundle Shape

```ts
interface QaCandidateBundle {
  readonly schemaVersion: 1;
  readonly exportId: string;
  readonly exportedAt: string;
  readonly evidenceDomainStatus:
    | "stable"
    | "reset_requires_manual_duplicate_review";
  readonly candidates: readonly QaCandidateArtifact[];
  readonly coverageDeclarations: readonly QaCoverageDeclaration[];
  readonly integrity: {
    readonly candidateCount: number;
    readonly candidateIds: readonly string[];
    readonly contentDigest: string;
  };
}
```

`contentDigest` is a 64-character lowercase SHA-256 digest over the canonical
sanitized bundle content excluding `integrity`. It detects accidental or stale
post-export edits, but it is not a cryptographic signature or proof of author.

`QaCoverageDeclaration` records provider, message family, applicable currency,
one of `candidate_collected`, `unavailable_in_qa_dataset`, or `pending`, related
candidate IDs, and QA observation time. It contains no source-message timestamp
or text.

## Candidate Shape

```ts
interface QaCandidateArtifact {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly evidenceDigest: string;
  readonly providerId: "qnb-egypt";
  readonly verifiedSenderAlias: string;
  readonly messageFamily:
    | "card_purchase"
    | "atm_withdrawal"
    | "incoming_ipn_transfer"
    | "outgoing_ipn_transfer"
    | "refund_or_reversal"
    | "failed_transaction"
    | "otp"
    | "informational"
    | "promotional";
  readonly currency: "EGP" | "USD" | null;
  readonly expectedOutcome: QaExpectedOutcome;
  readonly segments: readonly QaSanitizedSegment[];
  readonly sanitizedShape: string;
  readonly sourceType: "qa-real-sms";
  readonly runtimeScope: "candidate";
  readonly autoSelectPolicy: "never";
  readonly authorization: {
    readonly version: 1;
    readonly authorizationClass: "qa_operator_explicit";
    readonly authorizedAt: string;
    readonly providerScope: "qnb-egypt";
  };
  readonly createdAt: string;
}
```

`QaExpectedOutcome` is a discriminated union:

```ts
type QaExpectedOutcome =
  | {
      readonly kind: "transaction";
      readonly direction: "expense" | "income";
      readonly requiredPlaceholderRoles: readonly string[];
      readonly confidenceCeiling: number;
      readonly reviewStatus: "needs_review";
      readonly reviewReasons: readonly QaCandidateReviewReason[];
    }
  | {
      readonly kind: "rejection";
      readonly reason:
        | "failed_transaction"
        | "otp"
        | "informational"
        | "promotional";
    };
```

`confidenceCeiling` must be finite and within `0..1`. The closed
`QaCandidateReviewReason` vocabulary is defined in `data-model.md`; arbitrary
strings fail schema validation.

## Sanitized Segment Shape

```ts
type QaSanitizedSegment =
  | { readonly kind: "fixed"; readonly text: string }
  | {
      readonly kind: "placeholder";
      readonly token:
        | "CURRENCY"
        | "AMOUNT"
        | "BALANCE"
        | "LAST4"
        | "ACCOUNT"
        | "REFERENCE"
        | "MERCHANT"
        | "ATM_TERMINAL"
        | "PERSON"
        | "PHONE"
        | "DATE"
        | "TIME";
      readonly semanticRole: string;
      readonly wasOperatorCorrected: boolean;
    };
```

## Required Validation

- Parse with the versioned runtime schema; unknown keys fail validation.
- Rebuild `sanitizedShape` from segments and require exact equality.
- Reject duplicate candidate IDs or evidence digests.
- Require 64-character lowercase hexadecimal evidence and content digests, and
  recompute the content digest before export and import.
- Reject a `candidate_collected` coverage declaration without a matching
  candidate, or an unavailable declaration that references candidates.
- Reject unsupported provider, sender alias, currency, family, token, runtime
  scope, auto-select policy, or outcome combination.
- Reject source-message timestamps, raw IDs, SMS fingerprints, body/sender keys,
  and fixed segments containing detectable private values.
- Reject an artifact whose expected outcome disagrees with its family semantics.
- Reject transaction outcomes whose required placeholder roles are absent from
  the sanitized segments, non-rejection families without EGP/USD, and
  OTP/informational/promotional families with a currency.

## Export Rules

- Export is an explicit operator action after every candidate is approved.
- The only destination is a local Android directory chosen through the document
  storage picker.
- After manual transfer, the file must enter `.local/qa-sms-intake/`; import
  commands reject input outside that ignored staging root.
- No clipboard, share sheet, analytics, logging, background upload, or network
  request may receive the serialized bundle.
- A failed or cancelled file operation leaves drafts approved but not exported;
  retry requires another explicit action.

The approved export screen must show only aggregate candidate/family counts,
local JSON destination, and the no-clipboard/no-sharing/no-upload reassurance.
It must not display sanitized shapes, sender aliases, evidence digests, or raw
source details.

## Example

```json
{
  "schemaVersion": 1,
  "candidateId": "generated-artifact-id",
  "evidenceDigest": "domain-separated-digest",
  "providerId": "qnb-egypt",
  "verifiedSenderAlias": "QNB",
  "messageFamily": "card_purchase",
  "currency": "EGP",
  "expectedOutcome": {
    "kind": "transaction",
    "direction": "expense",
    "requiredPlaceholderRoles": ["transaction_amount"],
    "confidenceCeiling": 0.8,
    "reviewStatus": "needs_review",
    "reviewReasons": ["candidate_pattern"]
  },
  "segments": [
    { "kind": "fixed", "text": "A reviewed provider phrase " },
    {
      "kind": "placeholder",
      "token": "AMOUNT",
      "semanticRole": "transaction_amount",
      "wasOperatorCorrected": false
    }
  ],
  "sanitizedShape": "A reviewed provider phrase <AMOUNT>",
  "sourceType": "qa-real-sms",
  "runtimeScope": "candidate",
  "autoSelectPolicy": "never",
  "authorization": {
    "version": 1,
    "authorizationClass": "qa_operator_explicit",
    "authorizedAt": "2026-07-13T00:00:00.000Z",
    "providerScope": "qnb-egypt"
  },
  "createdAt": "2026-07-13T00:00:00.000Z"
}
```

The example is synthetic and contains no source message text.
