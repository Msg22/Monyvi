import type { Sha256Provider } from "@monyvi/logic";

import {
  createMetalFinancialActionEnvelope,
  type CreateMetalFinancialActionEnvelopeInput,
} from "./metal-financial-action-adapter";
import type { MetalFinancialActionRepository } from "./metal-financial-action-repository";

export interface MetalHoldingCommandServiceDependencies {
  readonly repository: MetalFinancialActionRepository;
  readonly hashProvider: Sha256Provider;
}

export interface MetalHoldingCommandResult {
  readonly actionId: string;
  readonly kind: "committed" | "replay";
}

export interface MetalHoldingCommandService {
  readonly execute: (
    input: CreateMetalFinancialActionEnvelopeInput
  ) => Promise<MetalHoldingCommandResult>;
}

export function createMetalHoldingCommandService(
  dependencies: MetalHoldingCommandServiceDependencies
): MetalHoldingCommandService {
  async function execute(
    input: CreateMetalFinancialActionEnvelopeInput
  ): Promise<MetalHoldingCommandResult> {
    const envelope = createMetalFinancialActionEnvelope(input);
    const result = await dependencies.repository.commit({
      envelope,
      hashProvider: dependencies.hashProvider,
      validationInput: input.validationInput,
    });
    return Object.freeze({ actionId: envelope.actionId, kind: result.kind });
  }

  return Object.freeze({ execute });
}
