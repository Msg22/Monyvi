import { BaseMarketRate } from "./base/base-market-rate";

export class MarketRate extends BaseMarketRate {
  /** Check if market rate is stale (older than 24 hours). */
  isStale(): boolean {
    const dayInMs = 24 * 60 * 60 * 1000;
    return Date.now() - this.createdAt.getTime() > dayInMs;
  }

  /** Get a human-readable age such as "2h ago" or "1d ago". */
  getAge(): string {
    const seconds = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}
