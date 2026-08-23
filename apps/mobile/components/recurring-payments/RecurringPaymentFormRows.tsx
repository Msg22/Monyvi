import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

interface FormRowProps {
  readonly testID: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly labelSuffix?: string;
  readonly value: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly iconColor: string;
  readonly iconContainerClassName: string;
  readonly onPress: () => void;
}

export function FormRow({
  testID,
  icon,
  label,
  labelSuffix,
  value,
  description,
  actionLabel,
  onAction,
  iconColor,
  iconContainerClassName,
  onPress,
}: FormRowProps): React.JSX.Element {
  const { fontScale, width } = useWindowDimensions();
  const hasAction = actionLabel !== undefined && onAction !== undefined;
  const isCompactLayout = shouldUseCompactLayout(width, fontScale);

  if (hasAction) {
    return (
      <View testID={testID} className="px-4 py-3">
        <View className={isCompactLayout ? "flex-col" : "flex-row items-center"}>
          <TouchableOpacity
            className={isCompactLayout ? "flex-row items-center" : "flex-1 flex-row items-center"}
            onPress={onPress}
          >
            <View
              testID={`${testID}-icon`}
              className={`w-8 h-8 rounded-xl items-center justify-center me-3 ${iconContainerClassName}`}
            >
              <Ionicons name={icon} size={17} color={iconColor} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-[11px] font-semibold text-text-muted dark:text-text-muted-dark">
                  {label}
                </Text>
                {labelSuffix ? (
                  <Text className="ms-1 text-[11px] text-text-muted dark:text-text-muted-dark">
                    {labelSuffix}
                  </Text>
                ) : null}
              </View>
              {description ? (
                <Text className="mt-1 text-xs leading-4 text-text-secondary dark:text-text-secondary-dark">
                  {description}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.slate[400]} />
          </TouchableOpacity>
          <View
            testID={`${testID}-value-action`}
            className={isCompactLayout ? "self-end mt-2 items-end" : "ms-3 items-end"}
          >
            <Text className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
              {value}
            </Text>
            <TouchableOpacity testID={`${testID}-action`} className="mt-1" onPress={onAction}>
              <Text className="text-sm font-semibold text-nileGreen-500">{actionLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} className="px-4 py-3">
      <TouchableOpacity className="flex-row items-center" onPress={onPress}>
      <View
        testID={`${testID}-icon`}
        className={`w-8 h-8 rounded-xl items-center justify-center me-3 ${iconContainerClassName}`}
      >
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-[11px] font-semibold text-text-muted dark:text-text-muted-dark">{label}</Text>
          {labelSuffix ? <Text className="ms-1 text-[11px] text-text-muted dark:text-text-muted-dark">{labelSuffix}</Text> : null}
        </View>
        <Text className="text-sm font-bold text-text-primary dark:text-text-primary-dark">
          {value}
        </Text>
        {description ? <Text className="mt-1 text-xs leading-4 text-text-secondary dark:text-text-secondary-dark">{description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.slate[400]} />
      </TouchableOpacity>
      {actionLabel && onAction ? <TouchableOpacity testID={`${testID}-action`} className="self-end mt-1" onPress={onAction}><Text className="text-sm font-semibold text-nileGreen-500">{actionLabel}</Text></TouchableOpacity> : null}
    </View>
  );
}

export function Divider({
  index,
}: {
  readonly index: number;
}): React.JSX.Element {
  return (
    <View
      testID={`recurring-payment-divider-${index}`}
      className="h-px mx-4 bg-slate-200 dark:bg-slate-700"
    />
  );
}

export function ErrorText({
  children,
}: {
  readonly children: string;
}): React.JSX.Element {
  return <Text className="input-error">{children}</Text>;
}
