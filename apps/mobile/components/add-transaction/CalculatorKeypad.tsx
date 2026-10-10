import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useLocale } from "@/context/LocaleContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type CalculatorKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "DEL"
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "DONE";

interface CalculatorKeypadProps {
  readonly onKeyPress: (key: CalculatorKey) => void;
  readonly hide?: boolean;
  readonly compact?: boolean;
  /** Label for the primary action button. Defaults to "Done". */
  readonly actionLabel?: string;
}

const KEY_HEIGHT = 44;
const COMPACT_KEY_HEIGHT = 48;

/** Acceleration curve for long-press DEL (ms between deletions) */
const DEL_INITIAL_DELAY = 200;
const DEL_FAST_DELAY = 100;
const DEL_FASTEST_DELAY = 50;
const DEL_SPEED_UP_THRESHOLD = 5; // deletions before first speed-up
const DEL_FASTEST_THRESHOLD = 15; // deletions before reaching max speed

function getCalculatorKeyTestId(value: CalculatorKey): string {
  const keyNames: Record<CalculatorKey, string> = {
    ".": "dot",
    "0": "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    "+": "plus",
    "-": "minus",
    "*": "multiply",
    "/": "divide",
    "=": "equals",
    DEL: "del",
    DONE: "done",
  };

  return `calculator-key-${keyNames[value]}`;
}

function CompactCalculatorText({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className: string;
}): React.JSX.Element {
  const { fontFamily } = useLocale();

  return (
    <Text className={className} style={{ fontFamily: fontFamily.bold }}>
      {children}
    </Text>
  );
}

function CalculatorText({
  children,
  className,
  compact,
}: {
  readonly children: React.ReactNode;
  readonly className: string;
  readonly compact: boolean;
}): React.JSX.Element {
  if (compact) {
    return (
      <CompactCalculatorText className={className}>
        {children}
      </CompactCalculatorText>
    );
  }

  return <Text className={className}>{children}</Text>;
}

const Key = ({
  label,
  value,
  onPress,
  onLongPress,
  onPressOut,
  className = "",
  compact = false,
}: {
  label: string | React.ReactNode;
  value: CalculatorKey;
  onPress: (value: CalculatorKey) => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  className?: string;
  compact?: boolean;
}): React.JSX.Element => (
  <TouchableOpacity
    testID={getCalculatorKeyTestId(value)}
    className={`relative items-center justify-center rounded-2xl mx-1 flex-1 ${className}`}
    style={{ height: compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT }}
    activeOpacity={0.7}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        console.error
      );
      onPress(value);
    }}
    onLongPress={onLongPress}
    onPressOut={onPressOut}
    delayLongPress={400}
  >
    <View
      pointerEvents="none"
      className="absolute inset-0 rounded-2xl bg-slate-100 dark:bg-slate-800/50"
    />
    {typeof label === "string" ? (
      <CalculatorText
        compact={compact}
        className="text-xl font-bold text-slate-900 dark:text-white"
      >
        {label}
      </CalculatorText>
    ) : (
      label
    )}
  </TouchableOpacity>
);

const OperationKey = ({
  label,
  value,
  onPress,
  compact = false,
}: {
  label: string;
  value: CalculatorKey;
  onPress: (value: CalculatorKey) => void;
  compact?: boolean;
}): React.JSX.Element => (
  <TouchableOpacity
    testID={getCalculatorKeyTestId(value)}
    className="relative items-center justify-center rounded-2xl mx-1 flex-1"
    style={{ height: compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT }}
    activeOpacity={0.7}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        console.error
      );
      onPress(value);
    }}
  >
    <View
      pointerEvents="none"
      className="absolute inset-0 rounded-2xl bg-nileGreen-500/10 dark:bg-nileGreen-500/10"
    />
    <CalculatorText
      compact={compact}
      className="text-xl font-bold text-nileGreen-600 dark:text-nileGreen-400"
    >
      {label}
    </CalculatorText>
  </TouchableOpacity>
);

export function CalculatorKeypad({
  onKeyPress,
  hide,
  compact = false,
  actionLabel = "Done",
}: CalculatorKeypadProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  // Long-press DEL acceleration state
  const deleteIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const deleteCountRef = React.useRef(0);

  const clearDeleteInterval = React.useCallback((): void => {
    if (deleteIntervalRef.current !== null) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
    deleteCountRef.current = 0;
  }, []);

  const startAcceleratingDelete = React.useCallback((): void => {
    // Fire one immediate delete (the normal onPress already fired once)
    deleteCountRef.current = 1;

    const tick = (): void => {
      onKeyPress("DEL");
      deleteCountRef.current += 1;

      // Determine the next interval based on how many deletions have occurred
      let nextDelay = DEL_INITIAL_DELAY;
      if (deleteCountRef.current > DEL_FASTEST_THRESHOLD) {
        nextDelay = DEL_FASTEST_DELAY;
      } else if (deleteCountRef.current > DEL_SPEED_UP_THRESHOLD) {
        nextDelay = DEL_FAST_DELAY;
      }

      // Clear and restart with potentially faster interval
      if (deleteIntervalRef.current !== null) {
        clearInterval(deleteIntervalRef.current);
      }
      deleteIntervalRef.current = setInterval(tick, nextDelay);
    };

    // Start the initial repeating interval
    deleteIntervalRef.current = setInterval(tick, DEL_INITIAL_DELAY);
  }, [onKeyPress]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => clearDeleteInterval();
  }, [clearDeleteInterval]);

  if (hide) return null;

  return (
    <View
      testID="calculator-keypad"
      className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-2xl"
      style={{
        paddingBottom: insets.bottom + (compact ? 12 : 4),
        paddingTop: compact ? 12 : 10,
      }}
    >
      {/* Row 1: 1 2 3 ÷ */}
      <View className="flex-row mb-2 px-3">
        <Key label="1" value="1" onPress={onKeyPress} compact={compact} />
        <Key label="2" value="2" onPress={onKeyPress} compact={compact} />
        <Key label="3" value="3" onPress={onKeyPress} compact={compact} />
        <OperationKey label="÷" value="/" onPress={onKeyPress} compact={compact} />
      </View>

      {/* Row 2: 4 5 6 × */}
      <View className="flex-row mb-2 px-3">
        <Key label="4" value="4" onPress={onKeyPress} compact={compact} />
        <Key label="5" value="5" onPress={onKeyPress} compact={compact} />
        <Key label="6" value="6" onPress={onKeyPress} compact={compact} />
        <OperationKey label="×" value="*" onPress={onKeyPress} compact={compact} />
      </View>

      {/* Row 3: 7 8 9 - */}
      <View className="flex-row mb-2 px-3">
        <Key label="7" value="7" onPress={onKeyPress} compact={compact} />
        <Key label="8" value="8" onPress={onKeyPress} compact={compact} />
        <Key label="9" value="9" onPress={onKeyPress} compact={compact} />
        <OperationKey label="-" value="-" onPress={onKeyPress} compact={compact} />
      </View>

      {/* Row 4: . 0 ⌫ + */}
      <View className="flex-row mb-2 px-3">
        <Key label="." value="." onPress={onKeyPress} compact={compact} />
        <Key label="0" value="0" onPress={onKeyPress} compact={compact} />
        <Key
          label={
            <Ionicons
              name="backspace-outline"
              size={22}
              color={isDark ? palette.red[100] : palette.red[500]}
            />
          }
          value="DEL"
          onPress={onKeyPress}
          compact={compact}
          onLongPress={startAcceleratingDelete}
          onPressOut={clearDeleteInterval}
        />
        <OperationKey label="+" value="+" onPress={onKeyPress} compact={compact} />
      </View>

      {/* Bottom Row: = and Action Button (side by side) */}
      <View className="flex-row mt-1 px-3">
        <TouchableOpacity
          testID={getCalculatorKeyTestId("DONE")}
          className="relative flex-1 items-center justify-center rounded-2xl mx-1"
          style={{ height: compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT + 4 }}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              console.error
            );
            onKeyPress("DONE");
          }}
        >
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-2xl bg-nileGreen-500 shadow-md"
          />
          <CalculatorText
            compact={compact}
            className="text-white font-extrabold text-base"
          >
            {actionLabel}
          </CalculatorText>
        </TouchableOpacity>

        <TouchableOpacity
          testID={getCalculatorKeyTestId("=")}
          className="relative flex-1 items-center justify-center rounded-2xl mx-1"
          style={{ height: compact ? COMPACT_KEY_HEIGHT : KEY_HEIGHT + 4 }}
          activeOpacity={0.7}
          onPress={() => onKeyPress("=")}
        >
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-2xl bg-nileGreen-500/15 dark:bg-nileGreen-500/15"
          />
          <CalculatorText
            compact={compact}
            className="text-xl font-extrabold text-nileGreen-600 dark:text-nileGreen-400"
          >
            =
          </CalculatorText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
