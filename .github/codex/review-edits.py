from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


path = "apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx"
replace_once(
    path,
    '''        readonly initialValues: {\n          readonly startDate: Date;\n        };\n''',
    '''        readonly initialValues: {\n          readonly startDate: Date;\n          readonly expectedNextDueDate?: Date;\n        };\n''',
)
replace_once(
    path,
    '''        startDate: props.recurrenceAnchorDate\n          ? props.initialValues.startDate\n          : new Date("2026-06-01T00:00:00.000Z"),\n        endDate: mockFormEndDate,\n''',
    '''        startDate: props.recurrenceAnchorDate\n          ? props.initialValues.startDate\n          : new Date("2026-06-01T00:00:00.000Z"),\n        expectedNextDueDate: props.initialValues.expectedNextDueDate,\n        endDate: mockFormEndDate,\n''',
)
replace_once(
    path,
    '''    INVALID_END_DATE: "RECURRING_PAYMENT_INVALID_END_DATE",\n    INVALID_SCHEDULE: "RECURRING_PAYMENT_INVALID_SCHEDULE",\n    REACTIVATION_UNAVAILABLE: "RECURRING_PAYMENT_REACTIVATION_UNAVAILABLE",\n''',
    '''    INVALID_END_DATE: "RECURRING_PAYMENT_INVALID_END_DATE",\n    INVALID_SCHEDULE: "RECURRING_PAYMENT_INVALID_SCHEDULE",\n    CURRENCY_MISMATCH: "RECURRING_PAYMENT_CURRENCY_MISMATCH",\n    STALE_SCHEDULE: "RECURRING_PAYMENT_STALE_SCHEDULE",\n    REACTIVATION_UNAVAILABLE: "RECURRING_PAYMENT_REACTIVATION_UNAVAILABLE",\n''',
)
replace_once(
    path,
    '''          frequency: "MONTHLY",\n          startDate: new Date("2026-07-01T00:00:00.000Z"),\n          endDate: null,\n''',
    '''          frequency: "MONTHLY",\n          startDate: new Date("2026-07-01T00:00:00.000Z"),\n          expectedNextDueDate: new Date("2026-07-01T00:00:00.000Z"),\n          endDate: null,\n''',
)

print("Aligned edit-route regression coverage with expected Due payment baseline")
