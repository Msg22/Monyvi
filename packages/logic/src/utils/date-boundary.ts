/**
 * Returns whether a date falls on or before another date in local calendar days.
 */
export function isOnOrBeforeDay(date: Date, boundary: Date): boolean {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  const normalizedBoundary = new Date(boundary);
  normalizedBoundary.setHours(0, 0, 0, 0);

  return normalizedDate.getTime() <= normalizedBoundary.getTime();
}
