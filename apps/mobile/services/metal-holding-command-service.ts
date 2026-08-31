import type { Sha256Provider } from "@monyvi/logic";

import {
  createMetalFinancialActionEnvelope,
  type CreateMetalFinancialActionEnvelopeInput,
} from "./metal-financial-action-adapter";
import type {
  MetalFinancialActionCommitResult,
  MetalFinancialActionRepository,
} from "./metal-financial-action-repository";

export interface MetalHoldingCommandServiceDependencies {
  readonly repository: MetalFinancialActionRepository;
  readonly hashProvider: Sha256Provider;
}

export interface MetalHoldingCommandService {
  readonly execute: (
    input: CreateMetalFinancialActionEnvelopeInput
  ) => Promise<MetalFinancialActionCommitResult>;
}

export function createMetalHoldingCommandService(
  dependencies: MetalHoldingCommandServiceDependencies
): MetalHoldingCommandService {
  async function execute(
    input: CreateMetalFinancialActionEnvelopeInput
  ): Promise<MetalFinancialActionCommitResult> {
    const envelope = createMetalFinancialActionEnvelope(input);
    return dependencies.repository.commit({
      envelope,
      expectedHoldingRevision: input.expectedHoldingRevision,
      domainPayload: input.domainPayload,
      hashProvider: dependencies.hashProvider,
    });
  }

  return Object.freeze({ execute });
}
