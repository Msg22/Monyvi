import * as Crypto from "expo-crypto";
import type { Database } from "@nozbe/watermelondb";

import {
  createDisposeMetalHoldingCommandService,
  type DisposeMetalHoldingCommandService,
} from "./dispose-metal-holding-command-service";
import { createFinancialActionFoundationRepository } from "./financial-action-foundation-repository";
import {
  METAL_FINANCIAL_ACTION_REGISTRY,
  createMetalFinancialActionEnvelope,
} from "./metal-financial-action-adapter";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonicalText
    ),
};

export function createDisposeMetalHoldingProductionService(
  database: Database
): DisposeMetalHoldingCommandService {
  return createDisposeMetalHoldingCommandService({
    database,
    getCurrentUserDataScope,
    commitFinancialActionGroupLocally:
      createFinancialActionFoundationRepository({
        database,
        registry: METAL_FINANCIAL_ACTION_REGISTRY,
        getCurrentUserDataScope,
        assertExpectedCurrentUser,
      }).commitFinancialActionGroupLocally,
    createEnvelope: (input, payload) =>
      createMetalFinancialActionEnvelope({
        actionId: input.actionId,
        userId: input.userId,
        holdingId: input.holdingId,
        kind: "dispose",
        expectedHoldingRevision: input.expectedFinancialRevision,
        occurredAt: input.occurredAt,
        domainPayload: payload,
        validationInput: {
          latestAllowedCalendarDate: input.latestAllowedCalendarDate,
        },
      }),
    hashProvider: sha256Provider,
  });
}
