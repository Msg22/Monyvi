import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface QaSmsTextRange {
  readonly start: number;
  readonly end: number;
}

interface QaSmsTapRangeSelectorProps {
  readonly value: string;
  readonly selection: QaSmsTextRange | null;
  readonly clearSelectionLabel: string;
  readonly onSelectionChange: (selection: QaSmsTextRange | null) => void;
}

interface QaSmsRawTextPart {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly isWhitespace: boolean;
}

const RAW_TEXT_PART_PATTERN =
  /\s+|[\p{L}\p{M}]+|\d+(?:[.,]\d+)*|[^\s\p{L}\p{M}\d]+/gu;

function createRawTextParts(value: string): readonly QaSmsRawTextPart[] {
  return Array.from(value.matchAll(RAW_TEXT_PART_PATTERN), (match) => {
    const startOffset = match.index;
    return {
      text: match[0],
      startOffset,
      endOffset: startOffset + match[0].length,
      isWhitespace: /^\s+$/u.test(match[0]),
    };
  });
}

function isPartSelected(
  part: QaSmsRawTextPart,
  selection: QaSmsTextRange | null
): boolean {
  return (
    selection !== null &&
    part.startOffset >= selection.start &&
    part.endOffset <= selection.end
  );
}

export function QaSmsTapRangeSelector({
  value,
  selection,
  clearSelectionLabel,
  onSelectionChange,
}: QaSmsTapRangeSelectorProps): React.JSX.Element {
  const parts = useMemo(() => createRawTextParts(value), [value]);
  const [anchorPartIndex, setAnchorPartIndex] = useState<number | null>(null);
  const [hasExtendedRange, setHasExtendedRange] = useState(false);

  function clearSelection(): void {
    setAnchorPartIndex(null);
    setHasExtendedRange(false);
    onSelectionChange(null);
  }

  function selectPart(partIndex: number): void {
    const part = parts[partIndex];
    if (!part || part.isWhitespace) return;

    if (selection === null || anchorPartIndex === null || hasExtendedRange) {
      setAnchorPartIndex(partIndex);
      setHasExtendedRange(false);
      onSelectionChange({
        start: part.startOffset,
        end: part.endOffset,
      });
      return;
    }

    const anchor = parts[anchorPartIndex];
    if (!anchor) return;
    onSelectionChange({
      start: Math.min(anchor.startOffset, part.startOffset),
      end: Math.max(anchor.endOffset, part.endOffset),
    });
    setHasExtendedRange(partIndex !== anchorPartIndex);
  }

  return (
    <View className="mt-2 min-h-[112px] rounded-lg border border-slate-300 px-4 py-3 dark:border-slate-700">
      <Text
        testID="qa-sms-local-raw-preview"
        selectable={false}
        className="text-base leading-6 text-text-primary dark:text-slate-100"
      >
        {parts.map((part, index) => (
          <Text
            key={`${part.startOffset}:${part.endOffset}`}
            testID={
              part.isWhitespace
                ? undefined
                : `qa-sms-raw-part-${part.startOffset}-${part.endOffset}`
            }
            className={
              isPartSelected(part, selection)
                ? "bg-nileGreen-700 text-slate-25 dark:bg-nileGreen-400 dark:text-slate-950"
                : undefined
            }
            onPress={part.isWhitespace ? undefined : () => selectPart(index)}
          >
            {part.text}
          </Text>
        ))}
      </Text>

      {selection !== null ? (
        <TouchableOpacity
          testID="qa-sms-clear-selection"
          className="mt-3 min-h-10 self-end justify-center px-1"
          onPress={clearSelection}
        >
          <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {clearSelectionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
