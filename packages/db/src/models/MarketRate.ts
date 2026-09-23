import { BaseMarketRate } from "./base/base-market-rate";

/**
 * Snapshot identity/order/history compatibility record. Root timestamps are
 * ordering metadata only; current freshness comes from the selected atomic
 * market-rate snapshot's bound observation provider times (issue #302).
 */
export class MarketRate extends BaseMarketRate {}
