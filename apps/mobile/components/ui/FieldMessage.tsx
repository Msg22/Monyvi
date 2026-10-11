import { Text, type StyleProp, type TextStyle } from "react-native";

export interface FieldFeedback {
  readonly error?: string;
  readonly warning?: string;
  readonly helperText?: string;
}

export type PrimaryFieldMessage =
  | { readonly kind: "error" | "warning" | "helper"; readonly text: string }
  | null;

/** Empty and whitespace-only messages fall through to the next priority. */
export function selectPrimaryFieldMessage({
  error,
  warning,
  helperText,
}: FieldFeedback): PrimaryFieldMessage {
  if (error?.trim()) return { kind: "error", text: error };
  if (warning?.trim()) return { kind: "warning", text: warning };
  if (helperText?.trim()) return { kind: "helper", text: helperText };
  return null;
}

interface FieldMessageProps {
  readonly message: PrimaryFieldMessage;
  readonly testID?: string;
  readonly errorStyle?: StyleProp<TextStyle>;
}

export function FieldMessage({
  message,
  testID,
  errorStyle,
}: FieldMessageProps): React.JSX.Element | null {
  if (!message) return null;

  return (
    <Text
      testID={message.kind === "error" && testID ? testID + "-error" : undefined}
      accessibilityRole={message.kind === "error" ? "alert" : undefined}
      accessibilityLabel={message.kind === "error" ? message.text : undefined}
      className={
        message.kind === "error"
          ? "input-error"
          : message.kind === "warning"
            ? "mt-1.5 px-2 text-xs font-bold text-gold-600"
            : "mt-1.5 px-2 text-xs font-bold text-slate-500 dark:text-slate-400"
      }
      style={message.kind === "error" ? errorStyle : undefined}
    >
      {message.text}
    </Text>
  );
}
