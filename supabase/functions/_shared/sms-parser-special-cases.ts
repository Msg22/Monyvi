export function buildSmsParserSpecialCaseRules(): string {
  return `KNOWN COMPLETED-TRANSACTION EXCEPTION:
- Apply this exception only when the message Sender field is exactly "QNB EGYPT" and the body exactly matches "You have requested a transfer of : <AMOUNT> <CURRENCY> ,Please follow up on the transfer status through Online Banking".
- Parse only that exact template as an EXPENSE transaction with category="other", counterparty="", isTrusted=true, and confidenceScore no greater than 0.5 so it always needs review.
- Do not apply this exception to any other sender, or to any other message that says a transfer was requested or is pending.`;
}
