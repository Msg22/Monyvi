import { getCalendars } from "expo-localization";

import { voiceTimeZoneSchema } from "@monyvi/logic";

/**
 * Returns the device's primary validated IANA timezone.
 *
 * There is deliberately no UTC, Egypt, Intl, locale, or secondary-calendar
 * fallback. Missing or invalid device timezone context makes Voice unavailable.
 */
export function getDeviceTimeZone(): string | null {
  try {
    const timeZone = getCalendars()[0]?.timeZone ?? null;
    if (timeZone === null) {
      return null;
    }

    const parsed = voiceTimeZoneSchema.safeParse(timeZone);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
