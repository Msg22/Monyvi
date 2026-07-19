import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/navigation/PageHeader";
import { PermissionRecoveryModal } from "@/components/permissions/PermissionRecoveryModal";
import { useToast } from "@/components/ui/Toast";
import { QaSmsAuthorization } from "@/components/qa-sms-pattern-intake/QaSmsAuthorization";
import { QaSmsCoverageReview } from "@/components/qa-sms-pattern-intake/QaSmsCoverageReview";
import { QaSmsExportSummary } from "@/components/qa-sms-pattern-intake/QaSmsExportSummary";
import { QaSmsMessageList } from "@/components/qa-sms-pattern-intake/QaSmsMessageList";
import { QaSmsSanitizedReview } from "@/components/qa-sms-pattern-intake/QaSmsSanitizedReview";
import { SmsPermissionPrompt } from "@/components/sms-sync/SmsPermissionPrompt";
import { getQaSmsPatternIntakeAvailability } from "@/config/qa-sms-pattern-intake-config";
import { QA_SMS_PATTERN_INTAKE_PROVIDER } from "@/config/qa-sms-provider-config";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { useQaSmsPatternIntake } from "@/hooks/useQaSmsPatternIntake";

function AvailableQaSmsPatternIntakeScreen(): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const insets = useSafeAreaInsets();
  const bottomInset = useModalBottomInset();
  const intake = useQaSmsPatternIntake();
  const { showToast } = useToast();
  const lastExportResultRef = useRef<typeof intake.exportResult>(null);
  const isPermissionBlocked = intake.permissionStatus === "blocked";
  const reviewedFamilyCount = new Set(
    intake.coverageDeclarations
      .filter(({ status }) => status !== "pending")
      .map(({ messageFamily }) => messageFamily)
  ).size;

  useEffect(() => {
    if (
      intake.exportResult?.status === "exported" &&
      intake.exportResult !== lastExportResultRef.current
    ) {
      showToast({
        type: "success",
        title: t("export_success_title"),
        message: t("export_success_message"),
      });
    }
    lastExportResultRef.current = intake.exportResult;
  }, [intake.exportResult, showToast, t]);

  return (
    <View
      testID="qa-sms-pattern-intake-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={
          intake.step === "selection" ? t("selection_title") : t("screen_title")
        }
        subtitle={
          intake.step === "selection" ? undefined : t("internal_use_only")
        }
        variant="review"
        includeTopSafeAreaInset
        showBackButton
        onBack={() => {
          if (intake.navigateBack()) return;
          intake.reset();
          router.back();
        }}
      />

      {intake.step === "authorization" ? (
        <QaSmsAuthorization
          isAcknowledged={intake.isAcknowledged}
          canAuthorize={intake.canAuthorize}
          onAcknowledgedChange={intake.setAcknowledged}
          onAuthorize={() => void intake.authorize()}
          onCancel={() => router.back()}
          bottomInset={bottomInset}
        />
      ) : null}

      {intake.step === "selection" ? (
        <QaSmsMessageList
          messages={intake.messages}
          selectedIds={intake.selectedIds}
          isLoading={intake.isLoading}
          onToggle={intake.toggleMessage}
          onSelectNewest={intake.selectNewestMessages}
          onSanitize={() => void intake.sanitizeSelected()}
          onRetry={() => void intake.retryMessages()}
          providerName={QA_SMS_PATTERN_INTAKE_PROVIDER.displayName}
          bottomInset={bottomInset}
        />
      ) : null}

      {intake.step === "sanitized_review" && intake.currentDraft ? (
        <QaSmsSanitizedReview
          draft={intake.currentDraft}
          position={intake.currentDraftIndex + 1}
          total={intake.drafts.length}
          isLoading={intake.isLoading}
          rawPreview={intake.currentRawPreview}
          onClassify={intake.classifyCurrentDraft}
          onApprove={intake.approveCurrentDraft}
          onDiscard={intake.discardCurrentDraft}
          onEditPlaceholders={() => undefined}
          onPreviewCorrections={intake.previewCurrentDraftCorrections}
          onApplyCorrections={intake.applyCurrentDraftCorrections}
          onPrevious={intake.showPreviousDraft}
          onNext={intake.showNextDraft}
          topInset={insets.top}
          bottomInset={bottomInset}
        />
      ) : null}

      {intake.step === "coverage_review" ? (
        <QaSmsCoverageReview
          declarations={intake.coverageDeclarations}
          pendingCount={intake.pendingCoverageCount}
          onUpdate={intake.updateCoverage}
          onMarkPendingUnavailable={intake.markPendingCoverageUnavailable}
          onContinue={intake.goToExport}
          bottomInset={bottomInset}
        />
      ) : null}

      {intake.step === "local_export" ? (
        <QaSmsExportSummary
          approvedCandidateCount={intake.candidateArtifacts.length}
          reviewedFamilyCount={reviewedFamilyCount}
          isPreparing={intake.isLoading}
          errorCode={intake.errorCode}
          onExport={() => void intake.exportBundle()}
          onBack={intake.backToReview}
          bottomInset={bottomInset}
        />
      ) : null}

      <SmsPermissionPrompt
        visible={intake.step === "permission_recovery" && !isPermissionBlocked}
        requestPermission={intake.requestPermission}
        onPermissionGranted={() => undefined}
        onPermissionNotGranted={() => undefined}
        onDismiss={intake.reset}
      />
      <PermissionRecoveryModal
        visible={intake.step === "permission_recovery" && isPermissionBlocked}
        icon="chatbubble-ellipses-outline"
        title={t("permission_title")}
        message={t("permission_message")}
        primaryLabel={t("permission_settings")}
        cancelLabel={t("not_now")}
        onPrimaryPress={() => void intake.openSettings()}
        onCancel={intake.reset}
      />
      <PermissionRecoveryModal
        visible={intake.step === "evidence_recovery"}
        icon="shield-outline"
        title={t("evidence_recovery_title")}
        message={t("evidence_recovery_message")}
        primaryLabel={t("evidence_recovery_action")}
        cancelLabel={t("cancel")}
        onPrimaryPress={() => void intake.recoverEvidenceSecret()}
        onCancel={intake.reset}
      />
    </View>
  );
}

export default function QaSmsPatternIntakeScreen(): React.JSX.Element | null {
  const availability = getQaSmsPatternIntakeAvailability();
  if (!availability.isAvailable) return null;
  return <AvailableQaSmsPatternIntakeScreen />;
}
