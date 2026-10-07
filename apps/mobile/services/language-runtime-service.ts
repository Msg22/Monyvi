import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";
import { createLanguageCoordinator } from "./language-coordinator";
import {
  normalizeLayoutDirection,
  needsLayoutReload,
  reloadLayout,
} from "@/utils/rtl";

const LANGUAGE_RESTART_ATTEMPT_KEY = "@monyvi/language-restart-attempt";

export const languageCoordinator = createLanguageCoordinator({
  translate: (language): Promise<unknown> => i18n.changeLanguage(language),
  normalizeDirection: normalizeLayoutDirection,
  needsReload: needsLayoutReload,
  reload: reloadLayout,
  readMarker: (): Promise<string | null> =>
    AsyncStorage.getItem(LANGUAGE_RESTART_ATTEMPT_KEY),
  writeMarker: (marker): Promise<void> =>
    AsyncStorage.setItem(LANGUAGE_RESTART_ATTEMPT_KEY, marker),
  clearMarker: (): Promise<void> =>
    AsyncStorage.removeItem(LANGUAGE_RESTART_ATTEMPT_KEY),
});
