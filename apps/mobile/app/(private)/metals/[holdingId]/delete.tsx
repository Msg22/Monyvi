import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeleteMetalHoldingSheet } from "@/components/metals/DeleteMetalHoldingSheet";
import {
  getDeleteHoldingSheetCopy,
  getDeleteHoldingSheetHolding,
  type DeleteSheetTranslator,
} from "@/components/metals/delete-holding-presentation";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDeleteHoldingCommand } from "@/hooks/useDeleteHoldingCommand";
import { useDeleteMetalHolding } from "@/hooks/useDeleteMetalHolding";
import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";

export default function DeleteMetalHoldingRoute(): React.JSX.Element | null {
  const params = useLocalSearchParams<{ holdingId?: string | string[] }>();
  const holdingId = Array.isArray(params.holdingId)
    ? params.holdingId[0]
    : params.holdingId;
  const detail = useMetalHoldingDetail(holdingId);
  const command = useDeleteHoldingCommand(holdingId);
  const submission = useDeleteMetalHolding(command.input);
  const { t, i18n } = useTranslation("metals");
  const { t: tCommon } = useTranslation("common");
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const handleConfirm = useCallback(async (): Promise<void> => {
    const succeeded = await submission.submit();
    if (succeeded) router.replace("/metals");
  }, [submission]);

  const handleRetry = useCallback(async (): Promise<void> => {
    await command.refreshToken();
    const succeeded = await submission.retry();
    if (succeeded) router.replace("/metals");
  }, [command, submission]);

  const handleCancel = useCallback((): void => {
    router.back();
  }, []);

  const tMetals = useCallback<DeleteSheetTranslator>(
    (key, options): string => t(key, options),
    [t]
  );
  const tCommonCallback = useCallback<DeleteSheetTranslator>(
    (key, options): string => tCommon(key, options),
    [tCommon]
  );

  if (!holdingId) return null;

  if (detail.isLoading && detail.model === null) {
    return (
      <View className="flex-1 bg-background px-5 pt-3 dark:bg-background-dark">
        <Skeleton width="100%" height={260} borderRadius={16} />
      </View>
    );
  }

  const holding = getDeleteHoldingSheetHolding(
    detail.model,
    tMetals,
    i18n.resolvedLanguage
  );
  if (holding === null) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader
          showBackButton
          showDrawer={false}
          title={t("actions.delete")}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-lg font-semibold text-text-primary dark:text-text-primary-dark">
            {detail.error === null
              ? t("detail.not_found")
              : t("detail.load_error")}
          </Text>
        </View>
      </View>
    );
  }

  const isRtl =
    typeof i18n.dir === "function"
      ? i18n.dir(i18n.resolvedLanguage) === "rtl"
      : i18n.resolvedLanguage === "ar";

  return (
    <DeleteMetalHoldingSheet
      visible
      holding={holding}
      copy={getDeleteHoldingSheetCopy(
        tMetals,
        tCommonCallback,
        detail.model?.name ?? holding.name
      )}
      width={width}
      fontScale={fontScale}
      bottomInset={insets.bottom}
      leftInset={insets.left}
      rightInset={insets.right}
      isRtl={isRtl}
      isOffline={detail.isOffline}
      isSubmitting={submission.isSubmitting}
      submitError={submission.submitError}
      onConfirm={() => void handleConfirm()}
      onCancel={handleCancel}
      onRetry={() => void handleRetry()}
    />
  );
}
