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
  I18nManager,
  Modal,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DisposeMetalHoldingScreen,
  type DisposeMetalHoldingCopy,
} from "@/components/metals/DisposeMetalHoldingScreen";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useDisposeMetalHolding } from "@/hooks/useDisposeMetalHolding";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDisposeMetalHoldingProduction } from "@/hooks/useDisposeMetalHoldingProduction";

export default function DisposeMetalHoldingRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ holdingId?: string | string[] }>();
  const rawHoldingId = Array.isArray(params.holdingId)
    ? params.holdingId[0]
    : params.holdingId;
  const holdingId = rawHoldingId?.trim() ? rawHoldingId.trim() : undefined;
  const { t } = useTranslation("metals");
  // Gate on the private-shell truth: no facade, loader, or submit surface
  // until auth has resolved to an authenticated identity.
  const { userId: gateUserId, isResolvingUser } = useCurrentUser();
  if (!holdingId) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          title={t("dispose.title")}
          showBackButton
          showDrawer={false}
          onBack={router.back}
        />
        <View
          testID="metal-holding-dispose-missing-id"
          className="flex-1 items-center justify-center gap-4 px-6"
        >
          <Text
            accessibilityRole="alert"
            className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark"
          >
            {t("dispose.loadError")}
          </Text>
          <TouchableOpacity
            testID="metal-holding-dispose-missing-id-back"
            accessibilityRole="button"
            onPress={router.back}
            className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-700 px-5 dark:border-nileGreen-400"
          >
            <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("dispose.cancelLabel")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  if (isResolvingUser || gateUserId === null) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <View
          testID="metal-holding-dispose-auth-loading"
          className="flex-1 gap-4 px-5 py-6"
        >
          <Skeleton width="100%" height={64} />
          <Skeleton width="100%" height={132} />
          <Skeleton width="100%" height={112} />
        </View>
      </View>
    );
  }
  return <DisposeMetalHoldingForm holdingId={holdingId} />;
}

function DisposeMetalHoldingForm({
  holdingId,
}: {
  readonly holdingId: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const production = useDisposeMetalHoldingProduction();
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith(
    "ar"
  )
    ? ("ar" as const)
    : ("en" as const);
  const today = useMemo(getCairoTodayDate, []);
  const [isExitGuardVisible, setIsExitGuardVisible] = useState(false);
  const [isExitAllowed, setIsExitAllowed] = useState(false);

  const { userId: currentUserId } = useCurrentUser();
  const initialUserIdRef = useRef<string | null>(null);
  if (initialUserIdRef.current === null && currentUserId !== null) {
    initialUserIdRef.current = currentUserId;
  }
  const isUserChanged =
    initialUserIdRef.current !== null &&
    currentUserId !== initialUserIdRef.current;

  const form = useDisposeMetalHolding({
    holdingId,
    today,
    createId: production.createId,
    dependencies: production.dependencies,
  });

  const copy = useMemo(() => createDisposeCopy(t), [t]);
  const navigation = useNavigation();
  const pendingActionRef = useRef<NavigationAction | null>(null);
  const exitRequestedRef = useRef(false);
  const pendingDetailsRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const userIdRef = useRef(currentUserId);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  usePreventRemove(form.isDirty && !isExitAllowed, ({ data }) => {
    if (form.isSubmitting) return;
    pendingActionRef.current = data.action;
    exitRequestedRef.current = true;
    setIsExitGuardVisible(true);
  });

  // All post-save and discard navigation flows through this effect so the
  // prevent-remove guard is already disabled before any navigation runs.
  useEffect(() => {
    if (!isExitAllowed) return;
    if (pendingDetailsRef.current) {
      const id = pendingDetailsRef.current;
      pendingDetailsRef.current = null;
      // Return to the existing Details entry (Details → Dispose) rather than
      // stacking a second Details; direct links replace Dispose as a fallback.
      router.dismissTo({ pathname: "/metals/[id]", params: { id } });
      return;
    }
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      exitRequestedRef.current = false;
      navigation.dispatch(action);
    } else if (exitRequestedRef.current) {
      exitRequestedRef.current = false;
      router.back();
    }
  }, [isExitAllowed, navigation]);

  const requestExit = useCallback((): void => {
    if (form.isSubmitting) return;
    if (form.isDirty) {
      pendingActionRef.current = null;
      exitRequestedRef.current = true;
      setIsExitGuardVisible(true);
    } else {
      router.back();
    }
  }, [form.isDirty, form.isSubmitting]);

  const submit = useCallback((): void => {
    if (form.isSubmitting || isUserChanged) return;
    const submittedUserId = currentUserId;
    const submittedHoldingId = holdingId;
    const submittedHoldingName = form.model?.name ?? holdingId;
    void (async (): Promise<void> => {
      const saved = await form.submit();
      if (!saved) return;
      // Never navigate or toast from a stale async completion: the screen
      // may have unmounted or the account may have switched while saving.
      if (!isMountedRef.current) return;
      if (submittedUserId !== userIdRef.current) return;
      showToast({
        type: "success",
        title: t("dispose.success", {
          holdingName: submittedHoldingName,
        }),
      });
      pendingDetailsRef.current = submittedHoldingId;
      setIsExitAllowed(true);
    })();
  }, [currentUserId, form, holdingId, isUserChanged, showToast, t]);

  if (isUserChanged) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          title={t("dispose.title")}
          showBackButton
          showDrawer={false}
          onBack={router.back}
        />
        <View
          testID="metal-holding-dispose-auth-changed"
          className="flex-1 items-center justify-center gap-4 px-6"
        >
          <Text
            accessibilityRole="alert"
            className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark"
          >
            {t("dispose.submitErrors.authScopeChanged")}
          </Text>
          <TouchableOpacity
            testID="metal-holding-dispose-auth-changed-back"
            accessibilityRole="button"
            onPress={router.back}
            className="min-h-11 items-center justify-center rounded-xl border border-nileGreen-700 px-5 dark:border-nileGreen-400"
          >
            <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("dispose.cancelLabel")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <DisposeMetalHoldingScreen
        copy={copy}
        locale={locale}
        isRtl={I18nManager.isRTL}
        width={width}
        fontScale={fontScale}
        bottomInset={insets.bottom}
        category={form.category}
        otherTreatment={form.otherTreatment}
        treatment={form.treatment}
        disposalDate={form.disposalDate}
        notes={form.notes}
        rateEvidenceError={form.rateEvidenceError}
        isLoading={form.isLoading}
        isRateLoading={form.isRateLoading}
        isSubmitting={form.isSubmitting}
        loadError={form.loadError}
        submitError={form.submitError}
        validationErrors={form.validationErrors}
        onCategoryChange={form.setCategory}
        onOtherTreatmentChange={form.setOtherTreatment}
        onDateChange={form.setDisposalDate}
        onNotesChange={form.setNotes}
        onSubmit={submit}
        onRequestExit={requestExit}
        onRetry={form.retryLoad}
      />
      <Modal
        transparent
        animationType="fade"
        visible={isExitGuardVisible}
        onRequestClose={(): void => setIsExitGuardVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            testID="dispose-exit-guard"
            className="rounded-t-3xl bg-slate-25 px-5 pt-6 dark:bg-slate-900"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            <Text className="text-xl font-bold text-text-primary dark:text-text-primary-dark">
              {t("dispose.exitTitle")}
            </Text>
            <Text className="mt-2 text-sm text-text-secondary dark:text-text-secondary-dark">
              {t("dispose.exitMessage")}
            </Text>
            <View className="mt-5 gap-3">
              <TouchableOpacity
                accessibilityRole="button"
                onPress={(): void => {
                  setIsExitGuardVisible(false);
                  pendingActionRef.current = null;
                  exitRequestedRef.current = false;
                }}
                className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-4 dark:bg-nileGreen-500"
              >
                <Text className="font-bold text-slate-25 dark:text-slate-950">
                  {t("dispose.keepEditing")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={(): void => {
                  setIsExitGuardVisible(false);
                  setIsExitAllowed(true);
                }}
                className="min-h-12 items-center justify-center rounded-2xl border border-red-500 px-4"
              >
                <Text className="font-semibold text-red-600 dark:text-red-400">
                  {t("dispose.discardChanges")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createDisposeCopy(
  t: ReturnType<typeof useTranslation<"metals">>["t"]
): DisposeMetalHoldingCopy {
  return {
    title: t("dispose.title"),
    intro: t("dispose.intro"),
    whatHappened: t("dispose.whatHappened"),
    affectsRecords: t("dispose.affectsRecords"),
    categoryLabels: {
      lost_or_stolen: t("dispose.categories.lostOrStolen"),
      destroyed_or_damaged: t("dispose.categories.destroyedOrDamaged"),
      given_away: t("dispose.categories.givenAway"),
      donated: t("dispose.categories.donated"),
      other: t("dispose.categories.other"),
    },
    treatmentLabels: {
      write_off: t("dispose.treatments.writeOff"),
      external_transfer: t("dispose.treatments.externalTransfer"),
    },
    treatmentDescriptions: {
      write_off: t("dispose.treatments.writeOffDescription"),
      external_transfer: t("dispose.treatments.externalTransferDescription"),
    },
    dateLabel: t("dispose.dateLabel"),
    notesLabel: t("dispose.notesLabel"),
    notesTooLong: t("dispose.notesTooLong"),
    summaryTitle: t("dispose.summaryTitle"),
    writeOffSummary: t("dispose.writeOffSummary"),
    externalTransferSummary: t("dispose.externalTransferSummary"),
    activeOwnershipSummary: t("dispose.activeOwnershipSummary"),
    historySummary: t("dispose.historySummary"),
    noSaleMoneyOrAccountSummary: t("dispose.noSaleMoneyOrAccountSummary"),
    noSaleProfitLossSummary: t("dispose.noSaleProfitLossSummary"),
    rateEvidenceUnavailable: t("dispose.rateEvidenceUnavailable"),
    ratePendingLabel: t("dispose.ratePendingLabel"),
    submitLabel: t("dispose.submitLabel"),
    pendingLabel: t("dispose.pendingLabel"),
    cancelLabel: t("dispose.cancelLabel"),
    retryLabel: t("dispose.retryLabel"),
    loadError: t("dispose.loadError"),
    categoryRequired: t("dispose.categoryRequired"),
    treatmentRequired: t("dispose.treatmentRequired"),
    dateRequired: t("dispose.dateRequired"),
    dateInvalid: t("dispose.dateInvalid"),
    dateBeforeAcquisition: t("dispose.dateBeforeAcquisition"),
    submitFailed: t("dispose.submitFailed"),
    submitErrorMessages: {
      metal_holding_not_found: t("dispose.submitErrors.holdingNotFound"),
      metal_holding_not_active: t("dispose.submitErrors.holdingNotActive"),
      holding_revision_conflict: t("dispose.submitErrors.revisionConflict"),
      financial_action_auth_scope_changed: t(
        "dispose.submitErrors.authScopeChanged"
      ),
      metal_dispose_effective_active_holding_required: t(
        "dispose.submitErrors.notEffectiveHolding"
      ),
      metal_dispose_lifecycle_conflict: t(
        "dispose.submitErrors.lifecycleConflict"
      ),
      metal_dispose_date_before_acquisition: t(
        "dispose.submitErrors.dateBeforeAcquisition"
      ),
      metal_dispose_replay_requires_recovery: t(
        "dispose.submitErrors.recoveryRequired"
      ),
    },
  };
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
