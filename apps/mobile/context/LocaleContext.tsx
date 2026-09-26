import { createContext, useContext, useMemo } from "react";
import { I18nManager, Platform, View } from "react-native";
import { arabicFontFamily, fontFamily } from "../constants/typography";
import { useTranslationLanguage } from "@/hooks/useTranslationLanguage";

export type { SupportedLanguage } from "../i18n/translation-schema";

import type { SupportedLanguage } from "../i18n/translation-schema";

/**
 * Locale context state
 */
interface LocaleContextType {
  /** Current language code */
  language: SupportedLanguage;
  /** Whether the app is in RTL mode */
  isRTL: boolean;
  /** Locale-appropriate font family based on current language */
  fontFamily: Readonly<{
    regular: string;
    medium: string;
    semiBold: string;
    bold: string;
  }>;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

/**
 * LocaleProvider component that provides locale information to the app.
 *
 * This context exposes the current language, RTL state, and locale-appropriate
 * font family. It reads from the i18next instance and I18nManager to ensure
 * consistency across the app.
 */
export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const currentLanguage = useTranslationLanguage();

  const value = useMemo<LocaleContextType>(
    () => ({
      language: currentLanguage,
      isRTL:
        Platform.OS === "web" ? currentLanguage === "ar" : I18nManager.isRTL,
      fontFamily: currentLanguage === "ar" ? arabicFontFamily : fontFamily,
    }),
    [currentLanguage]
  );

  const webLocaleProps: {
    readonly dir: "rtl" | "ltr";
    readonly lang: SupportedLanguage;
  } = {
    dir: currentLanguage === "ar" ? "rtl" : "ltr",
    lang: currentLanguage,
  };
  return (
    <LocaleContext.Provider value={value}>
      {Platform.OS === "web" ? (
        <View {...webLocaleProps} testID="web-locale-root" className="flex-1">
          {children}
        </View>
      ) : (
        children
      )}
    </LocaleContext.Provider>
  );
};

/**
 * Custom hook to use the locale context.
 *
 * Provides access to:
 * - `language`: Current language code ("en" or "ar")
 * - `isRTL`: Whether the app is in RTL mode
 * - `fontFamily`: Locale-appropriate font family for inline styles
 *
 * @example
 * ```tsx
 * const { language, isRTL, fontFamily } = useLocale();
 *
 * // i18n-ignore - developer placeholder
 * <Text style={{ fontFamily: fontFamily.bold }}>Title</Text>
 * // i18n-ignore — developer placeholder
 *
 * // Check RTL for conditional logic
 * if (isRTL) {
 *   // Apply RTL-specific logic
 * }
 * ```
 */
export function useLocale(): LocaleContextType {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}
