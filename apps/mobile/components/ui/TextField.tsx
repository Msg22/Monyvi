import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { FieldLabel, composeFieldAccessibleName } from "./FieldLabel";
import { FieldMessage, selectPrimaryFieldMessage } from "./FieldMessage";

interface TextFieldProps extends TextInputProps {
  readonly label: string;
  readonly required?: boolean;
  readonly variant?: "default" | "outlined";
  readonly error?: string;
  readonly warning?: string;
  readonly helperText?: string;
  readonly containerStyle?: ViewStyle;
  readonly containerClassName?: string;
  readonly labelClassName?: string;
  readonly labelStyle?: StyleProp<TextStyle>;
  readonly errorStyle?: StyleProp<TextStyle>;
  readonly leadingAdornment?: ReactNode;
  readonly trailingAdornment?: ReactNode;
  readonly inputRef?: Ref<TextInput>;
  readonly syncWhileFocused?: boolean;
}

const LEADING_ADORNMENT_SPACE = 43;
const TRAILING_ADORNMENT_SPACE = 48;

export function TextField({
  label,
  required,
  variant = "default",
  error,
  warning,
  helperText,
  containerStyle,
  containerClassName,
  labelClassName,
  labelStyle,
  errorStyle,
  className,
  style,
  value,
  onChangeText,
  onFocus,
  onBlur,
  accessibilityLabel,
  testID,
  leadingAdornment,
  trailingAdornment,
  inputRef,
  syncWhileFocused = false,
  ...props
}: TextFieldProps): React.JSX.Element {
  const { t } = useTranslation("common");
  const externalValue = value ?? "";
  const [draftValue, setDraftValue] = useState(externalValue);
  const isFocusedRef = useRef(false);
  const displayValue = syncWhileFocused ? externalValue : draftValue;
  const [leadingWidth, setLeadingWidth] = useState(LEADING_ADORNMENT_SPACE);
  const leadingPadding =
    variant === "outlined" ? leadingWidth + 8 : LEADING_ADORNMENT_SPACE;
  const requiredText = t("required_field");
  const accessibleName = composeFieldAccessibleName({
    label,
    accessibilityLabel,
    required,
    requiredText,
  });
  const resolvedHint =
    required && props.accessibilityHint?.trim() === requiredText
      ? undefined
      : props.accessibilityHint;
  const primaryMessage = selectPrimaryFieldMessage({
    error,
    warning,
    helperText,
  });
  const hasError = primaryMessage?.kind === "error";

  useEffect(() => {
    if (!isFocusedRef.current || syncWhileFocused) {
      setDraftValue(externalValue);
    }
  }, [externalValue, syncWhileFocused]);

  const handleChangeText = useCallback(
    (text: string): void => {
      setDraftValue(text);
      onChangeText?.(text);
    },
    [onChangeText]
  );

  const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
    (event) => {
      isFocusedRef.current = true;
      onFocus?.(event);
    },
    [onFocus]
  );

  const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
    (event) => {
      isFocusedRef.current = false;
      setDraftValue(externalValue);
      onBlur?.(event);
    },
    [externalValue, onBlur]
  );

  return (
    <View
      style={containerStyle}
      className={containerClassName ?? (variant === "outlined" ? "" : "mb-4")}
    >
      <FieldLabel
        label={label}
        required={required}
        className={
          labelClassName ??
          (variant === "outlined"
            ? "mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark"
            : "input-label")
        }
        style={labelStyle}
      />
      <View className="relative">
        <TextInput
          ref={inputRef}
          placeholderTextColor={palette.slate[400]}
          className={`${variant === "outlined" ? "min-h-11 rounded-lg border bg-slate-25 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-25" : "rounded-2xl border bg-white p-4 text-base font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"} ${
            hasError ? "border-red-500" : "border-slate-200"
          } ${className || ""}`}
          {...props}
          accessibilityLabel={accessibleName}
          accessibilityHint={resolvedHint}
          testID={testID}
          aria-invalid={hasError}
          style={[
            style,
            leadingAdornment ? { paddingStart: leadingPadding } : null,
            trailingAdornment ? { paddingEnd: TRAILING_ADORNMENT_SPACE } : null,
          ]}
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {leadingAdornment ? (
          <View
            testID={testID ? `${testID}-leading-adornment` : undefined}
            pointerEvents="none"
            onLayout={
              variant === "outlined"
                ? (event): void =>
                    setLeadingWidth(event.nativeEvent.layout.width)
                : undefined
            }
            className={variant === "outlined" ? "ps-3" : undefined}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              start: 0,
              width: variant === "outlined" ? undefined : 47,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {leadingAdornment}
          </View>
        ) : null}
        {trailingAdornment ? (
          <View
            testID={testID ? `${testID}-trailing-adornment` : undefined}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              end: 0,
              width: 50,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {trailingAdornment}
          </View>
        ) : null}
      </View>
      <FieldMessage
        message={primaryMessage}
        testID={testID}
        errorStyle={errorStyle}
      />
    </View>
  );
}
