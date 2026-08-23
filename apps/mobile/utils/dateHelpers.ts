import i18n from "../i18n";

/**
 * Get the current language from i18next instance.
 * Returns 'en' or 'ar' with proper type safety.
 */
function getCurrentLanguage(): "en" | "ar" {
  return i18n.language === "ar" ? "ar" : "en";
}

const SHORT_MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL_MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Arabic month names (same for short and full — Arabic doesn't abbreviate month names)
const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const DAYS_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

// Get localized month and day names based on current language
function getShortMonths(): string[] {
  return getCurrentLanguage() === "ar" ? MONTHS_AR : SHORT_MONTHS_EN;
}

function getFullMonths(): string[] {
  return getCurrentLanguage() === "ar" ? MONTHS_AR : FULL_MONTHS_EN;
}

function getDays(): string[] {
  return getCurrentLanguage() === "ar" ? DAYS_AR : DAYS_EN;
}

const DEFAULT_DATE_LOCALE = "en-EG";
const ARABIC_DATE_LOCALE = "ar-EG";
const LOCAL_DATE_FORMAT_OPTIONS_EN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const LOCAL_DATE_FORMAT_OPTIONS_AR: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
};

export type DateFormat = "MMM d, yyyy" | "EEEE, MMM d" | "MMM d" | "MMMM yyyy";

export function getStartOfDay(d: number | Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getEndOfDay(d: number | Date): number {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function getStartOfWeek(d: Date, startOnMonday = true): number {
  const date = new Date(d);
  const day = date.getDay();
  const dayIndex = startOnMonday ? (day === 0 ? 6 : day - 1) : day;
  date.setDate(date.getDate() - dayIndex);
  return getStartOfDay(date);
}

export function getEndOfWeek(d: Date, startOnMonday = true): number {
  const start = new Date(getStartOfWeek(d, startOnMonday));
  start.setDate(start.getDate() + 6);
  return getEndOfDay(start);
}

export function getStartOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function getEndOfMonth(d: Date): number {
  return new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).getTime();
}

/**
 * Get the same day of the month in the next month.
 * Handles month-end overflow (e.g., Jan 31 → Feb 28).
 */
export function getNextMonthSameDay(date: Date): Date {
  const next = new Date(date);
  const currentDay = next.getDate();
  next.setMonth(next.getMonth() + 1);

  // If the day overflowed (e.g., Jan 31 → Mar 3), clamp to last day of target month
  if (next.getDate() !== currentDay) {
    next.setDate(0); // sets to last day of the previous month (i.e. the target month)
  }

  return next;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function getDaysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function getDueText(date: Date): string {
  const days = getDaysUntil(date);

  if (days < 0) {
    return i18n.t("common:due_overdue", { count: Math.abs(days) });
  }
  if (days === 0) {
    return i18n.t("common:due_today");
  }
  if (days === 1) {
    return i18n.t("common:due_tomorrow");
  }
  return i18n.t("common:due_in_days", { count: days });
}

export function calculateDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  );
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function isDateInCurrentMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

/**
 * Convert Western digits (0-9) to Arabic-Indic numerals and Latin comma to
 * Arabic comma when the current language is Arabic.
 */
function localizeArabicOutput(str: string): string {
  if (getCurrentLanguage() !== "ar") return str;
  return str
    .replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)))
    .replace(/,/g, "،");
}

export function formatDate(date: Date, format: DateFormat): string {
  const shortMonths = getShortMonths();
  const fullMonths = getFullMonths();
  const days = getDays();

  switch (format) {
    case "MMM d, yyyy":
      return localizeArabicOutput(
        `${shortMonths[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
      );
    case "EEEE, MMM d":
      return localizeArabicOutput(
        `${days[date.getDay()]}, ${shortMonths[date.getMonth()]} ${date.getDate()}`
      );
    case "MMM d":
      return localizeArabicOutput(
        `${shortMonths[date.getMonth()]} ${date.getDate()}`
      );
    case "MMMM yyyy":
      return localizeArabicOutput(
        `${fullMonths[date.getMonth()]} ${date.getFullYear()}`
      );
    default:
      return date.toDateString();
  }
}

/** Format a Date as a readable string */
export function formatToLocalDateString(date: Date, locale?: string): string {
  const isArabic = getCurrentLanguage() === "ar";
  const baseLocale =
    locale || (isArabic ? ARABIC_DATE_LOCALE : DEFAULT_DATE_LOCALE);
  // Enforce Western Arabic numerals (FR-009) via Unicode numbering system extension
  const effectiveLocale = baseLocale.startsWith("ar")
    ? `${baseLocale}-u-nu-latn`
    : baseLocale;
  const formatOptions = isArabic
    ? LOCAL_DATE_FORMAT_OPTIONS_AR
    : LOCAL_DATE_FORMAT_OPTIONS_EN;
  return date.toLocaleDateString(effectiveLocale, formatOptions);
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return i18n.t("common:just_now");
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return i18n.t("common:minutes_ago", { count: minutes });
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return i18n.t("common:hours_ago", { count: hours });
  }
  const days = Math.floor(seconds / 86400);
  return i18n.t("common:days_ago", { count: days });
}

/**
 * Calculate the next due date for a recurring payment based on its frequency.
 * Handles DAILY, WEEKLY, MONTHLY, QUARTERLY, and YEARLY frequencies.
 * Falls back to MONTHLY if the frequency is unrecognised.
 */
export function calculateNextDueDate(
  currentDueDate: Date,
  frequency: string
): Date {
  const next = new Date(currentDueDate);

  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "MONTHLY":
      return addMonthsClamped(currentDueDate, 1);
    case "QUARTERLY":
      return addMonthsClamped(currentDueDate, 3);
    case "YEARLY":
      return addMonthsClamped(currentDueDate, 12);
    default:
      return addMonthsClamped(currentDueDate, 1);
  }

  return next;
}

function addMonthsClamped(date: Date, months: number): Date {
  const next = new Date(date);
  const dayOfMonth = next.getDate();

  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0
  ).getDate();
  next.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));

  return next;
}
