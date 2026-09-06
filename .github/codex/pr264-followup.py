from pathlib import Path

path = Path("apps/mobile/app/(private)/add-transaction.tsx")
text = path.read_text()
old = '''    const recurring = await createRecurringPayment({
      name: recurringName,
      amount,
      currency,
      type,
      accountId: selectedAccountId,
      categoryId: selectedCategoryId,
      frequency: recurringFrequency,
      startDate: date,
      initialOccurrenceRecorded: true,
      action: recurringAutoCreate ? "AUTO_CREATE" : "NOTIFY",
    });
    return recurring.id;
'''
new = '''    try {
      const recurring = await createRecurringPayment({
        name: recurringName,
        amount,
        currency,
        type,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
        frequency: recurringFrequency,
        startDate: date,
        initialOccurrenceRecorded: true,
        action: recurringAutoCreate ? "AUTO_CREATE" : "NOTIFY",
      });
      return recurring.id;
    } catch (error: unknown) {
      if (getRecurringPaymentErrorMessage(error, t) === null) {
        logger.error("Recurring payment operation failed", error, {
          operation: "create",
          source: "add-transaction",
        });
      }
      throw error;
    }
'''
if text.count(old) != 1:
    raise RuntimeError(f"Expected one recurring create block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
