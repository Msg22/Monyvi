import type { Href } from "expo-router";

export function getEditMetalHoldingHref(holdingId: string): Href {
  return `/metals/${holdingId}/edit`;
}
