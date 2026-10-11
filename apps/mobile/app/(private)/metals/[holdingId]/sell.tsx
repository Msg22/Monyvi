import { router, useLocalSearchParams } from "expo-router";
import {
  useNavigation,
  usePreventRemove,
  type NavigationAction,
} from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SellMetalHoldingScreen } from "@/components/metals/SellMetalHoldingScreen";
import {
  createSellMetalHoldingCopy,
  mapSellMetalHoldingErrors,
  type SellMetalHoldingCopy,
} from "@/components/metals/sell-copy";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSellMetalHolding } from "@/hooks/useSellMetalHolding";
import {
  useSellMetalHoldingProduction,
  type UseSellMetalHoldingProductionResult,
} from "@/hooks/useSellMetalHoldingProduction";
import {
  formatSellMetalHoldingPreview,
  previewSellMetalHolding,
  type SellableMetalHolding,
  type SellMetalHoldingFormCommand,
} from "@/services/sell-metal-holding-facade-service";

export default function SellMetalHoldingRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ holdingId?: string | string[] }>();
  const rawId = Array.isArray(params.holdingId)
    ? params.holdingId[0]
    : params.holdingId;
  const holdingId = rawId?.trim();
  const { t, i18n } = useTranslation("metals");
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith(
    "ar"
  )
    ? "ar"
    : "en";
  const copy = createSellMetalHoldingCopy((key): string => t(key));
  const { userId, isResolvingUser } = useCurrentUser();
  if (!holdingId)
    return (
      <SellLoadError
        copy={copy}
        testID="metal-holding-sell-missing-id"
        onRetry={router.back}
      />
    );
  if (isResolvingUser || userId === null)
    return <SellSkeleton testID="metal-holding-sell-auth-loading" />;
  return (
    <SellHoldingContext
      key={`${userId}:${holdingId}`}
      holdingId={holdingId}
      locale={locale}
      copy={copy}
    />
  );
}

function SellHoldingContext({
  holdingId,
  locale,
  copy,
}: {
  readonly holdingId: string;
  readonly locale: string;
  readonly copy: SellMetalHoldingCopy;
}): React.JSX.Element {
  const production = useSellMetalHoldingProduction(holdingId, locale);
  if (production.holding === null) {
    if (production.isLoading)
      return <SellSkeleton testID="metal-holding-sell-loading" />;
    return (
      <SellLoadError
        copy={copy}
        testID="metal-holding-sell-load-error"
        onRetry={production.reload}
      />
    );
  }
  return (
    <SellHoldingForm
      holding={production.holding}
      production={production}
      locale={locale}
      copy={copy}
    />
  );
}

function SellHoldingForm({
  holding,
  production,
  locale,
  copy,
}: {
  readonly holding: SellableMetalHolding;
  readonly production: UseSellMetalHoldingProductionResult;
  readonly locale: string;
  readonly copy: SellMetalHoldingCopy;
}): React.JSX.Element {
  const today = useMemo(getCairoTodayDate, []);
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const form = useSellMetalHolding<SellMetalHoldingFormCommand>({
    intentKey: `${holding.userId}:${holding.holdingId}:${holding.expectedFinancialRevision}:${holding.predecessorEventId}`,
    lockedSaleCurrency: holding.purchaseCurrency,
    initialValues: {
      saleDate: today,
      saleCurrency: holding.purchaseCurrency,
      grossProceedsDecimal: "",
      feeDecimal: "",
      notes: "",
      hasAcknowledgedRateRisk: false,
    },
    buildPreview: (values) => previewSellMetalHolding(holding, values, today),
    createCommand: (values, preview, ids): SellMetalHoldingFormCommand => ({
      values,
      preview,
      ids,
      holding,
      latestAllowedCalendarDate: today,
    }),
    execute: production.execute,
    createId: production.createId,
  });
  const [exitAllowed, setExitAllowed] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const navigation = useNavigation();
  const pendingNavigation = useRef<NavigationAction | null>(null);
  const exitRequested = useRef(false);
  const saved = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  usePreventRemove(
    form.isSubmitting || (form.isDirty && !exitAllowed),
    ({ data }): void => {
      if (form.isSubmitting) return;
      pendingNavigation.current = data.action;
      exitRequested.current = true;
      setShowExit(true);
    }
  );
  useEffect(() => {
    if (!exitAllowed) return;
    if (saved.current) {
      saved.current = false;
      router.dismissTo({
        pathname: "/metals/[id]",
        params: { id: holding.holdingId },
      });
    } else if (pendingNavigation.current) {
      navigation.dispatch(pendingNavigation.current);
      pendingNavigation.current = null;
    } else if (exitRequested.current) {
      exitRequested.current = false;
      router.back();
    }
  }, [exitAllowed, holding.holdingId, navigation]);
  const requestExit = useCallback((): void => {
    if (form.isSubmitting) return;
    if (form.isDirty) {
      exitRequested.current = true;
      setShowExit(true);
    } else router.back();
  }, [form.isDirty, form.isSubmitting]);
  const submit = useCallback((): void => {
    void (async (): Promise<void> => {
      const completed = await form.submit();
      if (!completed || !mounted.current) return;
      showToast({ type: "success", title: copy.success });
      saved.current = true;
      setExitAllowed(true);
    })();
  }, [copy.success, form, showToast]);
  const retry = useCallback((): void => {
    if (form.isSubmitting) return;
    if (
      production.loadError !== null ||
      form.submitError === "holding_revision_conflict" ||
      form.submitError === "holding_projection_changed" ||
      form.submitError === "metal_holding_not_active"
    ) {
      production.reload();
    } else submit();
  }, [form.isSubmitting, form.submitError, production, submit]);
  const rawPreview = previewSellMetalHolding(holding, form.values, today);
  const display = formatSellMetalHoldingPreview(
    rawPreview,
    holding.purchaseCurrency,
    locale
  );
  return (
    <View className="flex-1 bg-slate-25 dark:bg-slate-900">
      <SellMetalHoldingScreen
        holdingName={holding.name}
        values={form.values}
        copy={copy}
        purchaseDate={holding.purchaseDate}
        today={today}
        locale={locale}
        width={width}
        fontScale={fontScale}
        bottomInset={insets.bottom}
        preview={{
          ...display,
          canSubmit:
            display.canSubmit &&
            !production.isLoading &&
            production.loadError === null,
          validationErrors: mapSellMetalHoldingErrors(
            display.validationErrors,
            copy
          ),
        }}
        isSubmitting={form.isSubmitting}
        submitError={
          form.submitError === null && production.loadError === null
            ? null
            : form.submitError === "holding_revision_conflict"
              ? copy.conflict
              : copy.failed
        }
        onChange={form.updateField}
        onSubmit={submit}
        onRetry={retry}
        onRequestExit={requestExit}
      />
      <Modal
        visible={showExit}
        transparent
        animationType="fade"
        onRequestClose={(): void => setShowExit(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            testID="metal-holding-sell-exit-guard"
            className="gap-4 rounded-t-3xl bg-slate-25 px-4 pt-6 dark:bg-slate-900"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Text className="text-xl font-semibold text-text-primary dark:text-text-primary-dark">
              {copy.exitTitle}
            </Text>
            <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
              {copy.exitBody}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={(): void => setShowExit(false)}
              className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700"
            >
              <Text className="font-semibold text-slate-25">
                {copy.keepEditing}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={(): void => {
                setShowExit(false);
                setExitAllowed(true);
              }}
              className="min-h-12 items-center justify-center"
            >
              <Text className="font-semibold text-red-600 dark:text-red-300">
                {copy.discard}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SellSkeleton({
  testID,
}: {
  readonly testID: string;
}): React.JSX.Element {
  return (
    <View
      testID={testID}
      className="flex-1 gap-6 bg-slate-25 px-4 pt-6 dark:bg-slate-900"
    >
      <Skeleton width="100%" height={64} />
      <Skeleton width="100%" height={112} />
      <Skeleton width="100%" height={240} />
    </View>
  );
}

function SellLoadError({
  copy,
  testID,
  onRetry,
}: {
  readonly copy: SellMetalHoldingCopy;
  readonly testID: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <View testID={testID} className="flex-1 bg-slate-25 dark:bg-slate-900">
      <PageHeader
        title={copy.title}
        showBackButton
        showDrawer={false}
        onBack={router.back}
      />
      <View className="flex-1 items-center justify-center gap-4 px-4">
        <Text
          accessibilityRole="alert"
          className="text-center text-base text-text-primary dark:text-text-primary-dark"
        >
          {copy.loadError}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onRetry}
          className="min-h-12 justify-center px-4"
        >
          <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-300">
            {copy.retry}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getCairoTodayDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
