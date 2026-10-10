import { formatAmountInput, resolveAmountInputChange } from "@monyvi/logic";
import { useCallback, type ReactNode, type Ref } from "react";
import type {
  StyleProp,
  TextInput,
  TextInputProps,
  TextStyle,
} from "react-native";

import { TextField } from "./TextField";

export interface GroupedDecimalInputProps {
  readonly value: string;
  readonly onCanonicalChange: (value: string) => void;
  readonly label: string;
  readonly required?: boolean;
  readonly testID: string;
  readonly editable?: boolean;
  readonly error?: string;
  readonly autoFocus?: boolean;
  readonly keyboardType?: "decimal-pad" | "numeric" | "numbers-and-punctuation";
  readonly inputMode?: "decimal" | "numeric" | "text" | "none";
  readonly leadingAdornment?: ReactNode;
  readonly trailingAdornment?: ReactNode;
  readonly inputRef?: Ref<TextInput>;
  readonly accessibilityLabel?: string;
  readonly placeholder?: string;
  readonly containerClassName?: string;
  readonly maxLength?: number;
  readonly className?: string;
  readonly style?: TextInputProps["style"];
  readonly labelClassName?: string;
  readonly labelStyle?: StyleProp<TextStyle>;
  readonly onFocus?: TextInputProps["onFocus"];
  readonly onBlur?: TextInputProps["onBlur"];
  readonly showSoftInputOnFocus?: boolean;
}

/**
 * Shared grouped decimal input for numeric fields.
 *
 * Formats display with thousands commas using formatAmountInput while preserving
 * canonical state as plain dot-decimal without separators. Preserves full
 * decimal precision (e.g. 3-decimal gram weight) without rounding, and preserves
 * invalid intermediate text for form-level inline validation.
 */
export function GroupedDecimalInput({
  value,
  onCanonicalChange,
  label,
  required,
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
  maxLength,
  className,
  style,
  labelClassName,
  labelStyle,
  onFocus,
  onBlur,
  showSoftInputOnFocus,
}: GroupedDecimalInputProps): React.JSX.Element {
  const handleChangeText = useCallback(
    (text: string): void => {
      const resolution = resolveAmountInputChange(text, value);
      onCanonicalChange(resolution.accepted ? resolution.value : text);
    },
    [onCanonicalChange, value]
  );
  const resolvedInputMode =
    showSoftInputOnFocus === false ? "none" : inputMode;

  return (
    <TextField
      variant="outlined"
      testID={testID}
      inputRef={inputRef}
      label={label}
      required={required}
      accessibilityLabel={accessibilityLabel ?? label}
      value={formatAmountInput(value)}
      syncWhileFocused
      editable={editable}
      onChangeText={handleChangeText}
      error={error}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      inputMode={resolvedInputMode}
      leadingAdornment={leadingAdornment}
      trailingAdornment={trailingAdornment}
      placeholder={placeholder}
      containerClassName={containerClassName}
      className={className}
      style={style}
      labelClassName={labelClassName}
      labelStyle={labelStyle}
      maxLength={maxLength}
      onFocus={onFocus}
      onBlur={onBlur}
      showSoftInputOnFocus={showSoftInputOnFocus}
    />
  );
}
