import React from "react";

import {
  GroupedDecimalInput,
  type GroupedDecimalInputProps,
} from "./GroupedDecimalInput";

export type GroupedMoneyInputProps = GroupedDecimalInputProps;

/**
 * Centralized grouped monetary input.
 *
 * Delegates to the shared GroupedDecimalInput numeric foundation.
 * Display groups thousands with commas while state stays canonical dot-decimal
 * without separators. Invalid pasted text is preserved for form-specific inline
 * validation; only known-good grouped input is normalized. Validation stays
 * form-specific — this component never accepts or rejects values, it only shapes text.
 */
export function GroupedMoneyInput(
  props: GroupedMoneyInputProps
): React.JSX.Element {
  return <GroupedDecimalInput {...props} />;
}
