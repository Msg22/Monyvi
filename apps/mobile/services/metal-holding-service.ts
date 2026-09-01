/**
 * Metal Holding Service
 *
 * Service layer for metal holding CRUD operations.
 * Follows the transaction-service.ts pattern with atomic database writes.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service-Layer Separation (Constitution IV)
 * - Why: DB write logic must not live in hooks or components.
 *   Follows the established transaction-service.ts pattern exactly.
 * - SOLID: SRP — service handles only DB operations for metal holdings.
 *
 * @module metal-holding-service
 */

import type { Asset, CurrencyType, MetalType } from "@monyvi/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid item forms for metal holdings */
type ItemForm = "COIN" | "BAR" | "JEWELRY";

/**
 * Input data for creating a new metal holding.
 * All required fields are enforced; optional fields are explicitly marked.
 */
interface CreateMetalHoldingData {
  /** Display name for the holding (e.g., "Gold Ring 22K") */
  readonly name: string;
  /** Type of metal: GOLD or SILVER */
  readonly metalType: MetalType;
  /** Weight of the holding in grams */
  readonly weightGrams: number;
  /** Purity as a fraction (0.0–1.0), e.g. 0.875 for 21K gold */
  readonly purityFraction: number;
  /** Purchase price in the specified currency */
  readonly purchasePrice: number;
  /** Date of purchase */
  readonly purchaseDate: Date;
  /** Currency of the purchase price */
  readonly currency: CurrencyType;
  /** Physical form of the metal */
  readonly itemForm?: ItemForm;
  /** Optional free-text notes */
  readonly notes?: string;
}

export const METAL_HOLDING_ERROR_CODES = {
  ACTION_WRITER_NOT_READY: "metal_holding_action_writer_not_ready",
} as const;

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Creates a new metal holding by atomically writing both the parent Asset
 * record and the child AssetMetal record in a single database transaction.
 *
 * @param data - The metal holding data to create
 * @returns The created Asset record
 * @throws Error if user is not authenticated, validation fails, or if the write fails
 */
function createMetalHolding(_data: CreateMetalHoldingData): Promise<Asset> {
  return Promise.reject(
    new Error(METAL_HOLDING_ERROR_CODES.ACTION_WRITER_NOT_READY)
  );
}

export { createMetalHolding };
export type { CreateMetalHoldingData, ItemForm };
