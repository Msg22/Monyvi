import { useTranslation } from "react-i18next";

import arUiPolish from "@/locales/ar/ui-polish.json";
import enUiPolish from "@/locales/en/ui-polish.json";

export interface UiPolishCopy {
  readonly wealth_breakdown: {
    readonly show: string;
    readonly hide: string;
    readonly close: string;
  };
  readonly metals_empty: {
    readonly header: string;
    readonly title: string;
    readonly body: string;
    readonly cta: string;
  };
}

export function useUiPolishCopy(): UiPolishCopy {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return language.startsWith("ar") ? arUiPolish : enUiPolish;
}
