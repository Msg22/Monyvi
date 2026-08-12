# Contract: SMS Review Draft Codec

## Ownership

`packages/logic/src/sms-review-drafts` owns this pure contract. It has no
WatermelonDB, mobile, network, logger, or clock dependency.

## Public API

```ts
interface EncodedSmsReviewDraft {
  readonly version: 1;
  readonly json: string;
}

interface SmsReviewDraftCodec {
  encode(transaction: ParsedSmsTransaction): EncodedSmsReviewDraft;
  decode(input: {
    readonly version: number;
    readonly json: string;
    readonly expectedFingerprint: string;
  }): ParsedSmsTransaction;
}
```

## Required Behavior

- Encode every field required by current SMS review, including raw SMS,
  fingerprint, provenance, confidence, review status/reasons, references, parsed
  values, and dates.
- Serialize dates consistently as ISO-8601 strings.
- Restore dates as valid `Date` instances.
- Reject malformed JSON, unsupported versions, missing/unknown invalid shapes,
  invalid dates, non-finite numeric values, empty required IDs/fingerprints, and
  fingerprint mismatch.
- Never log or return raw payload content in an error message.
- Preserve round-trip equality for all V1 fields.
- V1 output is immutable and deterministic for equivalent input.

## Failure Contract

Failures use stable privacy-safe codes such as:
- `unsupported_version`
- `malformed_payload`
- `invalid_date`
- `fingerprint_mismatch`

Callers must physically remove the invalid current-user item through a
privacy-safe cleanup path, without creating dismissed state. Invalid data must
never reach review or financial writes.
