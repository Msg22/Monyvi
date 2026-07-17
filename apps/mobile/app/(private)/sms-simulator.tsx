/**
 * Dev-only SMS Simulator screen.
 *
 * Injects fake SMS payloads into the live detection pipeline by re-emitting
 * the same DeviceEventEmitter event the native SmsBroadcastReceiver emits.
 * The full pipeline (filter → dedup → AI parse → account resolve → persist)
 * runs unchanged, so this validates the live detection feature end-to-end
 * without needing actual bank SMS messages.
 *
 * Guarded by `__DEV__` — renders nothing in release builds.
 *
 * @module sms-simulator
 */

import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import {
  injectBurst,
  injectFakeSms,
  injectFixture,
  resetSimulatorState,
} from "@/services/dev/sms-simulator";
import { SMS_FIXTURES, type SmsFixture } from "@/services/dev/sms-fixtures";
import { onTransactionDetected } from "@/services/sms-live-listener-service";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_LOG_ENTRIES = 10;
const BURST_FIXTURE_ID = "nbe_debit_purchase";
const CONFIRM_ACTION_PROBE_FIXTURE_ID = "confirm_action_probe";
const DISCARD_ACTION_PROBE_FIXTURE_ID = "discard_action_probe";

interface LogEntry {
  readonly id: string;
  readonly receivedAt: number;
  readonly tx: ParsedSmsTransaction;
}

function FixtureRow({
  fixture,
  onInject,
}: {
  fixture: SmsFixture;
  onInject: (id: string) => void;
}): React.JSX.Element {
  const handlePress = useCallback((): void => {
    onInject(fixture.id);
  }, [fixture.id, onInject]);

  return (
    <View className="mb-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {fixture.label}
      </Text>
      <Text className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
        {fixture.description}
      </Text>
      <Text
        className="mt-1 text-xs text-slate-500 dark:text-slate-500"
        numberOfLines={2}
      >
        {fixture.sender}: {fixture.body}
      </Text>
      <TouchableOpacity
        testID={`sms-simulator-inject-${fixture.id}`}
        onPress={handlePress}
        className="mt-2 self-start rounded-lg bg-emerald-600 px-3 py-1.5 dark:bg-emerald-500"
      >
        <Text className="text-xs font-semibold text-white">Inject</Text>
      </TouchableOpacity>
    </View>
  );
}

const SCROLL_CONTENT_STYLE = { padding: 16, paddingBottom: 32 } as const;

export default function SmsSimulatorScreen(): React.JSX.Element | null {
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [customSender, setCustomSender] = useState<string>("");
  const [customBody, setCustomBody] = useState<string>("");

  // Subscribe to detected transactions and append to live log
  useEffect(() => {
    const unsubscribe = onTransactionDetected(
      (tx: ParsedSmsTransaction): void => {
        setLog((prev) => {
          const entry: LogEntry = {
            id: `${tx.smsFingerprint}-${Date.now()}`,
            receivedAt: Date.now(),
            tx,
          };
          const next = [entry, ...prev];
          return next.slice(0, MAX_LOG_ENTRIES);
        });
      }
    );
    return unsubscribe;
  }, []);

  const handleInjectFixture = useCallback((id: string): void => {
    injectFixture(id);
  }, []);

  const handleInjectCustom = useCallback((): void => {
    if (!customSender.trim() || !customBody.trim()) return;
    injectFakeSms({ sender: customSender.trim(), body: customBody.trim() });
  }, [customSender, customBody]);

  const handleBurst = useCallback((): void => {
    injectBurst(BURST_FIXTURE_ID, 3);
  }, []);

  const handleReset = useCallback((): void => {
    resetSimulatorState();
    setLog([]);
  }, []);

  const handleInjectConfirmProbe = useCallback((): void => {
    injectFixture(CONFIRM_ACTION_PROBE_FIXTURE_ID);
  }, []);

  const handleInjectDiscardProbe = useCallback((): void => {
    injectFixture(DISCARD_ACTION_PROBE_FIXTURE_ID);
  }, []);

  if (!__DEV__) return null;

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["bottom"]}
    >
      <PageHeader title="SMS Simulator (dev)" showBackButton />
      <ScrollView
        className="flex-1"
        contentContainerStyle={SCROLL_CONTENT_STYLE}
      >
        {/* Fixtures */}
        <Text className="mb-2 text-base font-bold text-slate-900 dark:text-slate-50">
          Fixtures
        </Text>
        <View className="mb-3 flex-row items-center gap-2">
          <TouchableOpacity
            testID="sms-simulator-reset-top"
            onPress={handleReset}
            className="rounded-lg bg-rose-600 px-3 py-1.5 dark:bg-rose-500"
          >
            <Text className="text-xs font-semibold text-white">Reset</Text>
          </TouchableOpacity>
          <Text
            testID="sms-simulator-log-count-top"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Live detection log count: {log.length}
          </Text>
        </View>
        <View className="mb-3 flex-row flex-wrap gap-2">
          <TouchableOpacity
            testID="sms-simulator-burst-top"
            onPress={handleBurst}
            className="rounded-lg bg-sky-600 px-3 py-1.5 dark:bg-sky-500"
          >
            <Text className="text-xs font-semibold text-white">Burst test</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="sms-simulator-inject-confirm-probe-top"
            onPress={handleInjectConfirmProbe}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 dark:bg-emerald-500"
          >
            <Text className="text-xs font-semibold text-white">
              Confirm probe
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="sms-simulator-inject-discard-probe-top"
            onPress={handleInjectDiscardProbe}
            className="rounded-lg bg-amber-600 px-3 py-1.5 dark:bg-amber-500"
          >
            <Text className="text-xs font-semibold text-white">
              Discard probe
            </Text>
          </TouchableOpacity>
        </View>
        {log[0] ? (
          <Text
            testID="sms-simulator-latest-summary"
            className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Latest detected: {log[0].tx.amount} {log[0].tx.currency} from{" "}
            {log[0].tx.senderDisplayName}
          </Text>
        ) : null}
        <FlatList
          {...ANDROID_SAFE_LIST_PROPS}
          data={SMS_FIXTURES}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => (
            <FixtureRow fixture={item} onInject={handleInjectFixture} />
          )}
          scrollEnabled={false}
        />

        {/* Free-form */}
        <Text className="mb-2 mt-4 text-base font-bold text-slate-900 dark:text-slate-50">
          Custom inject
        </Text>
        <TextInput
          testID="sms-simulator-custom-sender"
          value={customSender}
          onChangeText={setCustomSender}
          placeholder="Sender (e.g. NBE)"
          placeholderTextColor={palette.slate[400]}
          className="mb-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
        />
        <TextInput
          testID="sms-simulator-custom-body"
          value={customBody}
          onChangeText={setCustomBody}
          placeholder="SMS body…"
          placeholderTextColor={palette.slate[400]}
          multiline
          numberOfLines={4}
          className="mb-2 min-h-[80px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
          textAlignVertical="top"
        />
        <TouchableOpacity
          testID="sms-simulator-inject-custom"
          onPress={handleInjectCustom}
          className="self-start rounded-lg bg-emerald-600 px-4 py-2 dark:bg-emerald-500"
        >
          <Text className="text-sm font-semibold text-white">
            Inject custom
          </Text>
        </TouchableOpacity>

        {/* Tools */}
        <Text className="mb-2 mt-6 text-base font-bold text-slate-900 dark:text-slate-50">
          Tools
        </Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            testID="sms-simulator-burst"
            onPress={handleBurst}
            className="rounded-lg bg-amber-600 px-4 py-2 dark:bg-amber-500"
          >
            <Text className="text-sm font-semibold text-white">
              Burst (×3) — dedup test
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="sms-simulator-reset"
            onPress={handleReset}
            className="rounded-lg bg-rose-600 px-4 py-2 dark:bg-rose-500"
          >
            <Text className="text-sm font-semibold text-white">
              Reset cache + log
            </Text>
          </TouchableOpacity>
        </View>

        {/* Live log */}
        <Text className="mb-2 mt-6 text-base font-bold text-slate-900 dark:text-slate-50">
          Live detection log ({log.length}/{MAX_LOG_ENTRIES})
        </Text>
        <Text
          testID="sms-simulator-log-count"
          className="h-px overflow-hidden text-xs text-transparent"
        >{`sms-simulator-log-count-${log.length}`}</Text>
        {log.length === 0 ? (
          <Text className="text-sm text-slate-500 dark:text-slate-400">
            No transactions detected yet. Inject a fixture above.
          </Text>
        ) : (
          log.map((entry) => (
            <View
              key={entry.id}
              className="mb-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800"
            >
              <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {entry.tx.amount} {entry.tx.currency} ·{" "}
                {entry.tx.categoryDisplayName ?? "(no category)"}
              </Text>
              <Text className="text-xs text-slate-600 dark:text-slate-400">
                from {entry.tx.senderDisplayName}
                {entry.tx.cardLast4 ? ` · card ****${entry.tx.cardLast4}` : ""}
                {entry.tx.isAtmWithdrawal ? " · ATM" : ""}
              </Text>
              <Text
                className="mt-1 text-xs text-slate-500 dark:text-slate-500"
                numberOfLines={2}
              >
                {entry.tx.rawSmsBody}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
