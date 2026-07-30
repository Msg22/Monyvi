import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { palette } from "@/constants/colors";

interface TextFieldProps extends TextInputProps {
  readonly label: string;
  readonly error?: string;
  readonly containerStyle?: ViewStyle;
  readonly containerClassName?: string;
  readonly labelClassName?: string;
  readonly labelStyle?: StyleProp<TextStyle>;
  readonly errorStyle?: StyleProp<TextStyle>;
  readonly leadingAdornment?: ReactNode;
  readonly trailingAdornment?: ReactNode;
  readonly inputRef?: Ref<TextInput>;
}

const LEADING_ADORNMENT_SPACE = 43;
const TRAILING_ADORNMENT_SPACE = 48;

export function TextField({
  label,
  error,
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
  ...props
}: TextFieldProps): React.JSX.Element {
  const externalValue = value ?? "";
  const [draftValue, setDraftValue] = useState(externalValue);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraftValue(externalValue);
    }
  }, [externalValue]);

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
      onBlur?.(event);
    },
    [onBlur]
  );

  return (
    <View style={containerStyle} className={containerClassName ?? "mb-4"}>
      <Text className={labelClassName ?? "input-label"} style={labelStyle}>
        {label}
      </Text>
      <View className="relative">
        <TextInput
          ref={inputRef}
          placeholderTextColor={palette.slate[400]}
          className={`rounded-2xl border bg-white p-4 text-base font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white ${
            error ? "border-red-500" : "border-slate-200"
          } ${className || ""}`}
          {...props}
          accessibilityLabel={accessibilityLabel ?? label}
          testID={testID}
          aria-invalid={Boolean(error)}
          style={[
            style,
            leadingAdornment ? { paddingStart: LEADING_ADORNMENT_SPACE } : null,
            trailingAdornment ? { paddingEnd: TRAILING_ADORNMENT_SPACE } : null,
          ]}
          value={draftValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {leadingAdornment ? (
          <View
            testID={testID ? `${testID}-leading-adornment` : undefined}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              start: 0,
              width: 47,
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
      {error ? (
        <Text
          accessibilityRole="alert"
          className="input-error"
          style={errorStyle}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
