from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1))


service = "apps/mobile/services/recurring-payment-service.ts"
replace_once(
    service,
    '''function assertCurrencyMatchesAccount(
  currency: CurrencyType,
  account: Account
): void {
  if (account.currency !== currency) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH);
  }
}

function assertValidRecurringPaymentDateShape(''',
    '''function assertCurrencyMatchesAccount(
  currency: CurrencyType,
  account: Account
): void {
  if (account.currency !== currency) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH);
  }
}

function assertExpectedNextDueDate(
  payment: Pick<RecurringPayment, "nextDueDate">,
  expectedNextDueDate: Date | undefined
): void {
  if (
    expectedNextDueDate !== undefined &&
    (!isValidDate(expectedNextDueDate) ||
      !isSameLocalCalendarDay(payment.nextDueDate, expectedNextDueDate))
  ) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);
  }
}

function assertValidRecurringPaymentDateShape(''',
)
replace_once(
    service,
    '''  if (
    data.expectedNextDueDate !== undefined &&
    (!isValidDate(data.expectedNextDueDate) ||
      !isSameLocalCalendarDay(payment.nextDueDate, data.expectedNextDueDate))
  ) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);
  }
''',
    '''  assertExpectedNextDueDate(payment, data.expectedNextDueDate);
''',
)
replace_once(
    service,
    '''  await database.write(async () => {
    const previousEndDate = payment.endDate;
''',
    '''  await database.write(async () => {
    const currentPayment = await scope.findOwned(recurringCollection, paymentId);
    assertExpectedNextDueDate(currentPayment, data.expectedNextDueDate);

    const previousEndDate = payment.endDate;
''',
)
replace_once(
    service,
    '''    await payment.update((record) => {
      record.name = data.name;
''',
    '''    await currentPayment.update((record) => {
      record.name = data.name;
''',
)

edit_transaction = "apps/mobile/app/(private)/edit-transaction.tsx"
replace_once(
    edit_transaction,
    '''  evaluateAmountExpression,
  formatAmountInput,
} from "@monyvi/logic";''',
    '''  evaluateAmountExpression,
  formatAmountInput,
  formatStoredAmountInput,
} from "@monyvi/logic";''',
)
replace_once(
    edit_transaction,
    '''    const amountStr = transaction.amount.toString();''',
    '''    const amountStr = formatStoredAmountInput(transaction.amount);''',
)

hook = "apps/mobile/hooks/useTransactionEditState.ts"
replace_once(
    hook,
    '''import {
  parseAmountInput,
  type ParsedSmsTransaction,''',
    '''import {
  formatStoredAmountInput,
  parseAmountInput,
  type ParsedSmsTransaction,''',
)
replace_once(
    hook,
    '''  const [amount, setAmount] = useState(transaction.amount.toString());''',
    '''  const [amount, setAmount] = useState(
    formatStoredAmountInput(transaction.amount)
  );''',
)
replace_once(
    hook,
    '''    setAmount(transaction.amount.toString());''',
    '''    setAmount(formatStoredAmountInput(transaction.amount));''',
)
