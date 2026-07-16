# Contract: Trusted Placeholder Roles

Promotion rejects any role not listed here. Matching extracts every declared
placeholder, but only approved transaction roles shape a local suggestion.

| Semantic role                                                                               | Runtime policy                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transaction_currency`                                                                      | Required for transaction outcomes; normalize through existing supported-currency validation.                                                           |
| `transaction_amount`                                                                        | Required for transaction outcomes; parse finite positive amount within the existing maximum.                                                           |
| `transaction_date` / `transaction_time`                                                     | Optional; combine with the source received date using the existing local SMS date parser. Malformed explicit values make the local outcome unresolved. |
| `merchant_name`                                                                             | Optional counterparty for card purchases; trim only and never log.                                                                                     |
| `counterparty_person`                                                                       | Optional counterparty for incoming/outgoing IPN; trim only and never log.                                                                              |
| `card_last4`                                                                                | Optional four-digit card suffix passed to existing account matching.                                                                                   |
| `source_account_suffix` / `account_reference`                                               | Match and sanitize but do not persist or use for account matching in this release; issue #759 owns future account-suffix support.                      |
| `atm_terminal`                                                                              | Confirms reviewed ATM structure and sets ATM semantics; never becomes merchant/counterparty.                                                           |
| `available_balance`                                                                         | Match and validate numeric shape, then ignore; never persists in a suggestion.                                                                         |
| `transaction_reference`                                                                     | Match, then ignore after correlation; `smsFingerprint` remains the deduplication identity.                                                             |
| `provider_hotline` / `phone_number`                                                         | Match, then ignore.                                                                                                                                    |
| `message_code` / `otp_code`                                                                 | Rejection-template matching only; never emit transaction data.                                                                                         |
| `promotional_amount`, `promotional_rate`, `campaign_year`, `public_url`, `public_reference` | Rejection-template matching only; never emit transaction data.                                                                                         |

## Exact matching normalization

- Sender aliases: Unicode-preserving trim plus case-insensitive comparison.
- Message body: normalize CR/LF to spaces and collapse repeated whitespace.
- Fixed wording, letter case, punctuation, segment order, and placeholder order:
  exact.
- No fuzzy distance, keyword inference, optional fixed segment, or punctuation
  deletion is allowed.
