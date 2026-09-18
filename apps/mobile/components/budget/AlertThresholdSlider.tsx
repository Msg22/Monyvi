/**
 * AlertThresholdSlider Component
 *
 * Slider control for selecting the budget alert threshold (50-100%).
 * Supports the standard control and the compact approved-budget-mockup style.
 *
 * @module AlertThresholdSlider
 */

import { palette } from "@/constants/colors";
import React, { useCallback, useRef, useState } from "react";
import {
  PanResponder,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type PanResponderInstance,
} from "react-native";
import { useTranslation } from "react-i18next";

interface AlertThresholdSliderProps {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly variant?: "default" | "mockup";
}

interface SliderGeometry {
  readonly isMeasured: boolean;
  readonly fillWidth: number;
  readonly thumbLeft: number;
  readonly handleLayout: (event: LayoutChangeEvent) => void;
  readonly panResponder: PanResponderInstance;
  readonly trackRef: React.RefObject<View | null>;
}

const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 100;
const STEP = 5;
const DEFAULT_THUMB_SIZE = 24;
const MOCKUP_THUMB_SIZE = 16;
const DEFAULT_TRACK_HEIGHT = 6;
const MOCKUP_TRACK_HEIGHT = 4;

function thresholdFromPageX(
  pageX: number,
  trackX: number,
  trackWidth: number,
  currentValue: number
): number {
  if (trackWidth === 0) return currentValue;
  const relativeX = pageX - trackX;
  const clampedX = Math.max(0, Math.min(relativeX, trackWidth));
  const raw =
    MIN_THRESHOLD + (clampedX / trackWidth) * (MAX_THRESHOLD - MIN_THRESHOLD);
  const stepped = Math.round(raw / STEP) * STEP;
  return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, stepped));
}

function createSliderPanResponder(
  trackRef: React.RefObject<View | null>,
  trackXRef: React.MutableRefObject<number>,
  trackWidthRef: React.MutableRefObject<number>,
  valueRef: React.MutableRefObject<number>,
  onValueChangeRef: React.MutableRefObject<(value: number) => void>
): PanResponderInstance {
  const updateFromPageX = (pageX: number): void => {
    onValueChangeRef.current(
      thresholdFromPageX(
        pageX,
        trackXRef.current,
        trackWidthRef.current,
        valueRef.current
      )
    );
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gestureState) =>
      Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
      Math.abs(gestureState.dx) > 5,
    onPanResponderGrant: (
      event: GestureResponderEvent,
      _gestureState: PanResponderGestureState
    ) => {
      trackRef.current?.measure((_x, _y, _width, _height, pageX: number) => {
        trackXRef.current = pageX;
        updateFromPageX(event.nativeEvent.pageX);
      });
    },
    onPanResponderMove: (event: GestureResponderEvent) => {
      updateFromPageX(event.nativeEvent.pageX);
    },
  });
}

function useSliderGeometry(
  value: number,
  onValueChange: (value: number) => void,
  thumbSize: number
): SliderGeometry {
  const [isMeasured, setIsMeasured] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const trackXRef = useRef(0);
  const trackRef = useRef<View>(null);
  const valueRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);
  valueRef.current = value;
  onValueChangeRef.current = onValueChange;

  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
    trackRef.current?.measure((_x, _y, _width, _height, pageX: number) => {
      trackXRef.current = pageX;
      setIsMeasured(true);
    });
  }, []);
  const panResponder = useRef(
    createSliderPanResponder(
      trackRef,
      trackXRef,
      trackWidthRef,
      valueRef,
      onValueChangeRef
    )
  ).current;
  const normalizedValue =
    (value - MIN_THRESHOLD) / (MAX_THRESHOLD - MIN_THRESHOLD);
  return {
    isMeasured,
    fillWidth: trackWidth > 0 ? normalizedValue * trackWidth : 0,
    thumbLeft: trackWidth > 0 ? normalizedValue * (trackWidth - thumbSize) : 0,
    handleLayout,
    panResponder,
    trackRef,
  };
}

function SliderHeader({
  value,
  variant,
}: {
  readonly value: number;
  readonly variant: NonNullable<AlertThresholdSliderProps["variant"]>;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  if (variant === "mockup") {
    return (
      <Text className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
        {t("alert_threshold")}
      </Text>
    );
  }
  return (
    <View className="mb-1.5 flex-row items-center justify-between">
      <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("alert_threshold")}
      </Text>
      <Text className="text-sm font-bold text-gold-600">
        {Math.round(value)}%
      </Text>
    </View>
  );
}

function MockupSliderTrackRow({
  geometry,
  thumbSize,
  value,
}: {
  readonly geometry: SliderGeometry;
  readonly thumbSize: number;
  readonly value: number;
}): React.JSX.Element {
  return (
    <View
      testID="budget-alert-threshold-track-row"
      className="flex-row items-center gap-3"
    >
      <View className="flex-1">
        <SliderTrack
          geometry={geometry}
          variant="mockup"
          thumbSize={thumbSize}
        />
      </View>
      <Text
        testID="budget-alert-threshold-percentage"
        className="text-base font-bold text-nileGreen-500"
      >
        {Math.round(value)}%
      </Text>
    </View>
  );
}

function SliderFill({
  width,
  height,
  color,
}: {
  readonly width: number;
  readonly height: number;
  readonly color: string;
}): React.JSX.Element {
  return (
    <View
      className="absolute rounded-full"
      style={{ height, width, backgroundColor: color }}
    />
  );
}

function SliderThumb({
  left,
  size,
  color,
}: {
  readonly left: number;
  readonly size: number;
  readonly color: string;
}): React.JSX.Element {
  return (
    <View
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left,
        backgroundColor: color,
        shadowColor: palette.slate[950],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 3,
        elevation: 3,
      }}
    />
  );
}

function SliderTrack({
  geometry,
  variant,
  thumbSize,
}: {
  readonly geometry: SliderGeometry;
  readonly variant: NonNullable<AlertThresholdSliderProps["variant"]>;
  readonly thumbSize: number;
}): React.JSX.Element {
  const trackHeight =
    variant === "mockup" ? MOCKUP_TRACK_HEIGHT : DEFAULT_TRACK_HEIGHT;
  const fillColor =
    variant === "mockup" ? palette.nileGreen[500] : palette.gold[600];
  const thumbColor =
    variant === "mockup" ? palette.slate[25] : palette.gold[600];
  return (
    <View
      ref={geometry.trackRef}
      onLayout={geometry.handleLayout}
      className="justify-center"
      style={{ height: thumbSize + (variant === "mockup" ? 4 : 8) }}
      {...geometry.panResponder.panHandlers}
    >
      <View
        className="w-full rounded-full bg-slate-200 dark:bg-slate-700"
        style={{ height: trackHeight }}
      />
      {geometry.isMeasured ? (
        <>
          <SliderFill
            width={geometry.fillWidth}
            height={trackHeight}
            color={fillColor}
          />
          <SliderThumb
            left={geometry.thumbLeft}
            size={thumbSize}
            color={thumbColor}
          />
        </>
      ) : null}
    </View>
  );
}

function DefaultSliderHelp(): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <>
      <View className="mt-1 flex-row justify-between">
        <Text className="text-xs text-slate-400 dark:text-slate-500">
          {MIN_THRESHOLD}%
        </Text>
        <Text className="text-xs text-slate-400 dark:text-slate-500">
          {MAX_THRESHOLD}%
        </Text>
      </View>
      <Text className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        {t("alert_help_percentage")}
      </Text>
    </>
  );
}

export function AlertThresholdSlider({
  value,
  onValueChange,
  variant = "default",
}: AlertThresholdSliderProps): React.JSX.Element {
  const thumbSize =
    variant === "mockup" ? MOCKUP_THUMB_SIZE : DEFAULT_THUMB_SIZE;
  const geometry = useSliderGeometry(value, onValueChange, thumbSize);
  return (
    <View>
      <SliderHeader value={value} variant={variant} />
      {variant === "mockup" ? (
        <MockupSliderTrackRow
          geometry={geometry}
          thumbSize={thumbSize}
          value={value}
        />
      ) : (
        <SliderTrack
          geometry={geometry}
          variant={variant}
          thumbSize={thumbSize}
        />
      )}
      {variant === "default" ? <DefaultSliderHelp /> : null}
    </View>
  );
}
