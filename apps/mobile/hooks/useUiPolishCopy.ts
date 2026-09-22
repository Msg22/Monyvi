import { useTranslation } from "react-i18next";

import type { UiPolishTranslations } from "@/i18n/types";

export type UiPolishCopy = UiPolishTranslations;

export function useUiPolishCopy(): UiPolishCopy {
  const { t } = useTranslation("ui-polish");

  return {
    wealth_breakdown: {
      show: t("wealth_breakdown.show"),
      hide: t("wealth_breakdown.hide"),
      close: t("wealth_breakdown.close"),
    },
    metals_empty: {
      header: t("metals_empty.header"),
      title: t("metals_empty.title"),
      body: t("metals_empty.body"),
      cta: t("metals_empty.cta"),
    },
  };
}
