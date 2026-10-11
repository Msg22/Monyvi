import {
  getEditableAmountDisplay,
  resolveEditableAmountInputChange,
} from "@monyvi/logic";
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
  readonly variant?: "default" | "outlined";
  readonly allowNegative?: boolean;
  readonly testID: string;
  readonly editable?: boolean;
  readonly error?: string;
  readonly warning?: string;
  readonly helperText?: string;
  readonly autoFocus?: boolean;
  readonly keyboardType?: "decimal-pad" | "numeric" | "numbers-and-punctuation";
  readonly inputMode?: "decimal" | "numeric" | "text" | "none";
  /** Opt in to native keyboardType precedence when no inputMode is supplied. */
  readonly preserveKeyboardType?: boolean;
  readonly leadingAdornment?: ReactNode;
  readonly trailingAdornment?: ReactNode;
  readonly inputRef?: Ref<TextInput>;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
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
 * Groups recognized decimal entry text and preserves malformed raw text for
 * correction. Signed values are opt-in; existing outlined/unsigned consumers
 * retain their callbacks, formatting, and form-specific validation.
 */
export function GroupedDecimalInput({
  value,
  onCanonicalChange,
  label,
  required,
  variant = "outlined",
  allowNegative = false,
  testID,
  editable,
  error,
  warning,
  helperText,
  autoFocus,
  keyboardType = "decimal-pad",
  inputMode,
  preserveKeyboardType = false,
  leadingAdornment,
  trailingAdornment,
  inputRef,
  accessibilityLabel,
  accessibilityHint,
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
      const resolution = resolveEditableAmountInputChange(text, value, {
        allowNegative,
      });
      onCanonicalChange(resolution.accepted ? resolution.value : text);
    },
    [allowNegative, onCanonicalChange, value]
  );
  const resolvedInputMode =
    showSoftInputOnFocus === false
      ? "none"
      : preserveKeyboardType && inputMode === undefined
        ? undefined
        : (inputMode ?? "decimal");
  const displayValue = getEditableAmountDisplay(value, {
    allowNegative,
  }).text;

  return (
    <TextField
      variant={variant}
      testID={testID}
      inputRef={inputRef}
      label={label}
      required={required}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      value={displayValue}
      syncWhileFocused
      editable={editable}
      onChangeText={handleChangeText}
      error={error}
      warning={warning}
      helperText={helperText}
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
