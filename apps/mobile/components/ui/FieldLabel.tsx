import { Text, type StyleProp, type TextStyle } from "react-native";

export interface RequiredAccessibleNameOptions {
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly required?: boolean;
  readonly requiredText: string;
}

/**
 * Compose a localized accessible name without repeating a complete final
 * required qualifier. Do not confuse a partial substring with the qualifier.
 */
export function composeFieldAccessibleName({
  label,
  accessibilityLabel,
  required,
  requiredText,
}: RequiredAccessibleNameOptions): string {
  const base = accessibilityLabel ?? label;
  if (!required || !requiredText) return base;

  // Detect a complete final qualifier even when followed by closing punctuation.
  // Never normalize or rewrite the caller's actual accessible name.
  const candidate = base.replace(/[\s)\]}'"»”’.,،؛:;!?؟]+$/u, "");
  if (candidate.endsWith(requiredText)) {
    const prefix = candidate.slice(0, -requiredText.length);
    const hasCompleteBoundary =
      prefix.length === 0 ||
      /[\s,،:;.!?؟]$/u.test(prefix) ||
      prefix.endsWith("(") ||
      prefix.endsWith("[") ||
      prefix.endsWith("{") ||
      prefix.endsWith('"') ||
      prefix.endsWith("'");
    if (hasCompleteBoundary) {
      return base;
    }
  }

  const separator = /[\u0600-\u06FF]/u.test(requiredText) ? "، " : ", ";
  return base + separator + requiredText;
}

interface FieldLabelProps {
  readonly label: string;
  readonly required?: boolean;
  readonly className?: string;
  readonly style?: StyleProp<TextStyle>;
}

export function FieldLabel({
  label,
  required,
  className,
  style,
}: FieldLabelProps): React.JSX.Element {
  return (
    <Text className={className} style={style}>
      {label}
      {required ? <Text className="text-red-500">{" *"}</Text> : null}
    </Text>
  );
}
