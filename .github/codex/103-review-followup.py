from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file_path.write_text(text.replace(old, new, 1))


amount_helpers = "packages/logic/src/utils/amount-helpers.ts"
replace_once(
    amount_helpers,
    '''  if (\n    options.maxFractionDigits !== undefined &&\n    fractionDigits > options.maxFractionDigits\n  ) {\n    return { success: false, reason: "exceeds-precision" };\n  }\n\n  const amount = decimalAmount.toNumber();\n''',
    '''  if (decimalAmount.lessThanOrEqualTo(0)) {\n    return { success: false, reason: "not-positive" };\n  }\n\n  if (\n    options.maxFractionDigits !== undefined &&\n    fractionDigits > options.maxFractionDigits\n  ) {\n    return { success: false, reason: "exceeds-precision" };\n  }\n\n  const amount = decimalAmount.toNumber();\n''',
)
replace_once(
    amount_helpers,
    '''  if (amount <= 0) {\n    return { success: false, reason: "not-positive" };\n  }\n\n  return {\n''',
    '''  return {\n''',
)
replace_once(
    amount_helpers,
    '''  const formattedPreviousValue = formatAmountInput(previousValue);\n  const ungroupedCandidate = text.replace(/,/g, "");\n''',
    '''  const previousIsValidIntermediate =\n    INTERMEDIATE_UNGROUPED_AMOUNT_PATTERN.test(previousValue) ||\n    INTERMEDIATE_GROUPED_AMOUNT_PATTERN.test(previousValue);\n\n  if (previousValue.length > 0 && !previousIsValidIntermediate) {\n    return { accepted: false, value: text };\n  }\n\n  const formattedPreviousValue = formatAmountInput(previousValue);\n  const ungroupedCandidate = text.replace(/,/g, "");\n''',
)

validation = "apps/mobile/validation/recurring-payment-validation.ts"
replace_once(
    validation,
    '''export interface RecurringPaymentValidationMessages {\n  readonly invalidAmount: string;\n''',
    '''export interface RecurringPaymentValidationMessages {\n  readonly amountRequired: string;\n  readonly invalidAmount: string;\n''',
)
replace_once(
    validation,
    '''const DEFAULT_MESSAGES: RecurringPaymentValidationMessages = {\n  invalidAmount: "Please enter a valid amount",\n''',
    '''const DEFAULT_MESSAGES: RecurringPaymentValidationMessages = {\n  amountRequired: "Amount is required",\n  invalidAmount: "Please enter a valid amount",\n''',
)
replace_once(
    validation,
    '''    case "required":\n      return "Amount is required";\n''',
    '''    case "required":\n      return messages.amountRequired;\n''',
)

form = "apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx"
replace_once(
    form,
    '''        messages: {\n          invalidAmount: t("invalid_amount"),\n''',
    '''        messages: {\n          amountRequired: t("amount_required"),\n          invalidAmount: t("invalid_amount"),\n''',
)
