from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


service = "apps/mobile/services/recurring-payment-service.ts"
replace_once(
    service,
    '  isSameLocalCalendarDay,\n  isValidCurrencyAmount,\n  isValidDate,\n',
    '  isSameLocalCalendarDay,\n  isValidCurrencyAmount,\n  isValidDate,\n  isValidTransactionAmount,\n',
)
replace_once(
    service,
    'export interface UpdateRecurringPaymentData extends RecurringPaymentData {\n  readonly reactivateAfterSaving?: boolean;\n}\n',
    'export interface UpdateRecurringPaymentData extends RecurringPaymentData {\n  readonly reactivateAfterSaving?: boolean;\n  readonly expectedNextDueDate?: Date;\n}\n',
)
replace_once(
    service,
    '  INVALID_END_DATE: "RECURRING_PAYMENT_INVALID_END_DATE",\n  INVALID_SCHEDULE: "RECURRING_PAYMENT_INVALID_SCHEDULE",\n} as const;\n',
    '  INVALID_END_DATE: "RECURRING_PAYMENT_INVALID_END_DATE",\n  INVALID_SCHEDULE: "RECURRING_PAYMENT_INVALID_SCHEDULE",\n  CURRENCY_MISMATCH: "RECURRING_PAYMENT_CURRENCY_MISMATCH",\n  STALE_SCHEDULE: "RECURRING_PAYMENT_STALE_SCHEDULE",\n} as const;\n',
)
replace_once(
    service,
    '''function assertValidRecurringPaymentAmount(\n  data: Pick<RecurringPaymentData, "amount" | "currency">\n): void {\n  if (!isValidCurrencyAmount(data.amount, data.currency)) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);\n  }\n}\n''',
    '''function assertValidRecurringPaymentAmountValue(amount: number): void {\n  if (!isValidTransactionAmount(amount)) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);\n  }\n}\n\nfunction assertValidRecurringPaymentAmountPrecision(\n  amount: number,\n  currency: CurrencyType\n): void {\n  if (!isValidCurrencyAmount(amount, currency)) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);\n  }\n}\n\nfunction assertCurrencyMatchesAccount(\n  currency: CurrencyType,\n  account: Account\n): void {\n  if (account.currency !== currency) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH);\n  }\n}\n''',
)
replace_once(
    service,
    '): Promise<void> {\n  let account: Account;\n',
    '): Promise<Account> {\n  let account: Account;\n',
)
replace_once(
    service,
    '  if (category.deleted || category.type !== paymentType) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE);\n  }\n}\n\n/**\n * Create a new recurring payment record.\n */\n',
    '  if (category.deleted || category.type !== paymentType) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE);\n  }\n\n  return account;\n}\n\n/**\n * Create a new recurring payment record.\n */\n',
)
replace_once(
    service,
    '  assertValidRecurringPaymentAmount(data);\n  assertValidRecurringPaymentDateShape(data);\n',
    '  assertValidRecurringPaymentAmountValue(data.amount);\n  assertValidRecurringPaymentDateShape(data);\n',
)
replace_once(
    service,
    '''  const scope = await getCurrentUserDataScope();\n  await resolveRecurringPaymentReferences(\n    scope,\n    data.accountId,\n    data.categoryId,\n    data.type\n  );\n\n  const recurringCollection =\n''',
    '''  const scope = await getCurrentUserDataScope();\n  const account = await resolveRecurringPaymentReferences(\n    scope,\n    data.accountId,\n    data.categoryId,\n    data.type\n  );\n  assertCurrencyMatchesAccount(data.currency, account);\n  assertValidRecurringPaymentAmountPrecision(data.amount, account.currency);\n\n  const recurringCollection =\n''',
)
# updateRecurringPayment has the same old early amount call once after create was replaced
replace_once(
    service,
    '  assertValidRecurringPaymentAmount(data);\n  assertValidRecurringPaymentDateShape(data);\n',
    '  assertValidRecurringPaymentAmountValue(data.amount);\n  assertValidRecurringPaymentDateShape(data);\n',
)
replace_once(
    service,
    '''  const payment = await scope.findOwned(recurringCollection, paymentId);\n\n  const dataMatchesStoredAnchor = isSameLocalCalendarDay(\n''',
    '''  const payment = await scope.findOwned(recurringCollection, paymentId);\n\n  if (\n    data.expectedNextDueDate !== undefined &&\n    (!isValidDate(data.expectedNextDueDate) ||\n      !isSameLocalCalendarDay(payment.nextDueDate, data.expectedNextDueDate))\n  ) {\n    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);\n  }\n\n  const dataMatchesStoredAnchor = isSameLocalCalendarDay(\n''',
)
replace_once(
    service,
    '''  assertStartDateAllowed(data.startDate, referenceDate, originalEditableDate);\n  assertEndDateAllowsDuePayment(requestedDueDate, data.endDate);\n  await resolveRecurringPaymentReferences(\n    scope,\n    data.accountId,\n    data.categoryId,\n    data.type\n  );\n\n  await database.write(async () => {\n''',
    '''  assertStartDateAllowed(data.startDate, referenceDate, originalEditableDate);\n  assertEndDateAllowsDuePayment(requestedDueDate, data.endDate);\n  const account = await resolveRecurringPaymentReferences(\n    scope,\n    data.accountId,\n    data.categoryId,\n    data.type\n  );\n  assertCurrencyMatchesAccount(data.currency, account);\n  assertValidRecurringPaymentAmountPrecision(data.amount, account.currency);\n\n  await database.write(async () => {\n''',
)

form = "apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx"
replace_once(
    form,
    '  readonly startDate: Date;\n  readonly endDate: Date | null;\n',
    '  readonly startDate: Date;\n  readonly expectedNextDueDate?: Date;\n  readonly endDate: Date | null;\n',
)
replace_once(
    form,
    '  "frequency",\n  "startDate",\n  "endDate",\n',
    '  "frequency",\n  "startDate",\n  "expectedNextDueDate",\n  "endDate",\n',
)
replace_once(
    form,
    '        initialValues.frequency,\n        initialValues.startDate.getTime(),\n        initialValues.endDate?.getTime() ?? "",\n',
    '        initialValues.frequency,\n        initialValues.startDate.getTime(),\n        initialValues.expectedNextDueDate?.getTime() ?? "",\n        initialValues.endDate?.getTime() ?? "",\n',
)
replace_once(
    form,
    '      initialValues.notes,\n      initialValues.startDate,\n      initialValues.endDate,\n',
    '      initialValues.notes,\n      initialValues.startDate,\n      initialValues.expectedNextDueDate,\n      initialValues.endDate,\n',
)
replace_once(
    form,
    '''      dirtyFieldsRef.current = new Set([...dirtyFieldsRef.current, field]);\n      setForm((prev) => ({ ...prev, [field]: value }));\n      if (field === "startDate") {\n        setErrors((prev) => ({\n''',
    '''      dirtyFieldsRef.current = new Set([...dirtyFieldsRef.current, field]);\n      if (field === "startDate") {\n        dirtyFieldsRef.current.add("expectedNextDueDate");\n      }\n      setForm((prev) => ({ ...prev, [field]: value }));\n      if (field === "startDate") {\n        setErrors((prev) => ({\n''',
)

edit_screen = "apps/mobile/app/(private)/edit-recurring-payment.tsx"
replace_once(
    edit_screen,
    '      frequency: payment.frequency,\n      startDate: payment.nextDueDate,\n      endDate: payment.endDate ?? null,\n',
    '      frequency: payment.frequency,\n      startDate: payment.nextDueDate,\n      expectedNextDueDate: payment.nextDueDate,\n      endDate: payment.endDate ?? null,\n',
)
replace_once(
    edit_screen,
    '        frequency: values.frequency,\n        startDate: values.startDate,\n        endDate: values.endDate,\n',
    '        frequency: values.frequency,\n        startDate: values.startDate,\n        expectedNextDueDate: values.expectedNextDueDate,\n        endDate: values.endDate,\n',
)

submission = "apps/mobile/utils/recurring-payment-submission.ts"
replace_once(
    submission,
    '''    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE:\n      return t("end_date_before_due");\n    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE:\n''',
    '''    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE:\n      return t("end_date_before_due");\n    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH:\n      return t("account_currency_mismatch");\n    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE:\n      return t("recurring_payment_stale_schedule");\n    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE:\n''',
)

replace_once(
    "apps/mobile/locales/en/transactions.json",
    '  "recurring_payment_category_unavailable": "This category is no longer available. Please choose another category.",\n',
    '  "recurring_payment_category_unavailable": "This category is no longer available. Please choose another category.",\n  "recurring_payment_stale_schedule": "This payment changed while you were editing. Review the latest details and try again.",\n',
)
replace_once(
    "apps/mobile/locales/ar/transactions.json",
    '  "recurring_payment_category_unavailable": "هذه الفئة لم تعد متاحة. اختر فئة أخرى.",\n',
    '  "recurring_payment_category_unavailable": "هذه الفئة لم تعد متاحة. اختر فئة أخرى.",\n  "recurring_payment_stale_schedule": "تم تحديث هذه الدفعة أثناء التعديل. راجع أحدث التفاصيل وحاول مرة أخرى.",\n',
)

tests = "apps/mobile/__tests__/services/recurring-payment-service.test.ts"
replace_once(
    tests,
    '''      Number.NaN,\n      Number.POSITIVE_INFINITY,\n      1_000_000_000.01,\n      12.345,\n    ])("rejects invalid create amount %p before resolving scope or writing", async (amount) => {\n''',
    '''      Number.NaN,\n      Number.POSITIVE_INFINITY,\n      1_000_000_000.01,\n    ])("rejects invalid create amount %p before resolving scope or writing", async (amount) => {\n''',
)
replace_once(
    tests,
    '''      await expect(\n        createRecurringPayment({\n          ...validCreateData,\n          amount: 12.345,\n          currency: "KWD",\n        })\n      ).resolves.toBeDefined();\n      await expect(\n        createRecurringPayment({\n          ...validCreateData,\n          amount: 0.12345678,\n          currency: "BTC",\n        })\n      ).resolves.toBeDefined();\n''',
    '''      mockFindOwned.mockResolvedValueOnce({\n        id: "account-1",\n        userId: "user-1",\n        currency: "KWD",\n      });\n      await expect(\n        createRecurringPayment({\n          ...validCreateData,\n          amount: 12.345,\n          currency: "KWD",\n        })\n      ).resolves.toBeDefined();\n      mockFindOwned.mockResolvedValueOnce({\n        id: "account-1",\n        userId: "user-1",\n        currency: "BTC",\n      });\n      await expect(\n        createRecurringPayment({\n          ...validCreateData,\n          amount: 0.12345678,\n          currency: "BTC",\n        })\n      ).resolves.toBeDefined();\n''',
)
replace_once(
    tests,
    '''      expect(mockWrite).toHaveBeenCalledTimes(3);\n    });\n\n    it("rejects a recurring currency that does not match the owned account", async () => {\n''',
    '''      expect(mockWrite).toHaveBeenCalledTimes(3);\n    });\n\n    it("validates decimal precision against the resolved account currency", async () => {\n      await expect(\n        createRecurringPayment({\n          ...validCreateData,\n          amount: 12.345,\n        })\n      ).rejects.toThrow(\n        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT\n      );\n\n      expect(mockGetCurrentUserDataScope).toHaveBeenCalledTimes(1);\n      expect(mockWrite).not.toHaveBeenCalled();\n    });\n\n    it("rejects a recurring currency that does not match the owned account", async () => {\n''',
)

print("Applied verified PR follow-up edits")
