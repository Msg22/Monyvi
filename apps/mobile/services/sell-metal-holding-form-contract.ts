export interface SellMetalHoldingValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
  readonly hasAcknowledgedRateRisk: boolean;
}

export type SellMetalHoldingField = keyof SellMetalHoldingValues;

export interface SellMetalHoldingPreviewState {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly netProceedsMinorUnits: string | null;
  readonly canSubmit: boolean;
}

export interface SellMetalHoldingRequestIds {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
}

export interface SellMetalHoldingHookCommand {
  readonly values: SellMetalHoldingValues;
  readonly preview: SellMetalHoldingPreviewState;
  readonly ids: SellMetalHoldingRequestIds;
}
