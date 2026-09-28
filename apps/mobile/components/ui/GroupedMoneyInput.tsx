import { formatAmountInput, resolveAmountInputChange } from "@monyvi/logic";
import { useCallback, type ReactNode, type Ref } from "react";
import type { TextInput } from "react-native";

import { TextField } from "./TextField";

interface GroupedMoneyInputProps {
  readonly value: string;
  readonly onCanonicalChange: (value: string) => void;
  readonly label: string;
  readonly testID: string;
  readonly editable?: boolean;
  readonly error?: string;
  readonly autoFocus?: boolean;
  readonly keyboardType?: "decimal-pad" | "numeric" | "numbers-and-punctuation";
  readonly inputMode?: "decimal" | "numeric" | "text";
  readonly leadingAdornment?: ReactNode;
  readonly trailingAdornment?: ReactNode;
  readonly inputRef?: Ref<TextInput>;
  readonly accessibilityLabel?: string;
  readonly placeholder?: string;
  readonly containerClassName?: string;
}

/**
 * Centralized grouped monetary input.
 *
 * Display groups thousands with commas (like Add Recurring Amount) while state
 * stays canonical dot-decimal without separators. Invalid pasted text is
 * preserved for form-specific inline validation; only known-good grouped input
 * is normalized. Validation stays form-specific — this component never accepts
 * or rejects values, it only shapes text.
 *
 * Weight/quantity fields must not use this component.
 */
export function GroupedMoneyInput({
  value,
  onCanonicalChange,
  label,
  testID,
  editable,
  error,
  autoFocus,
  keyboardType = "decimal-pad",
  inputMode = "decimal",
  leadingAdornment,
  trailingAdornment,
  inputRef,
  accessibilityLabel,
  placeholder,
  containerClassName,
}: GroupedMoneyInputProps): React.JSX.Element {
  const handleChangeText = useCallback(
    (text: string): void => {
      const resolution = resolveAmountInputChange(text, value);
      onCanonicalChange(resolution.accepted ? resolution.value : text);
    },
    [onCanonicalChange, value]
  );

  return (
    <TextField
      variant="outlined"
      testID={testID}
      inputRef={inputRef}
      label={label}
      accessibilityLabel={accessibilityLabel ?? label}
      value={formatAmountInput(value)}
      editable={editable}
      onChangeText={handleChangeText}
      error={error}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      inputMode={inputMode}
      leadingAdornment={leadingAdornment}
      trailingAdornment={trailingAdornment}
      placeholder={placeholder}
      containerClassName={containerClassName}
    />
  );
}
