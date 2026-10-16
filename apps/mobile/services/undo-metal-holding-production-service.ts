import * as Crypto from "expo-crypto";
import type { Database } from "@nozbe/watermelondb";
import type { FinancialActionEnvelopeV1 } from "@monyvi/logic";

import {
  createUndoMetalHoldingCommandService,
  type UndoMetalHoldingCommandService,
} from "./undo-metal-holding-command-service";
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

export function createUndoMetalHoldingProductionService(
  database: Database
): UndoMetalHoldingCommandService {
  return createUndoMetalHoldingCommandService({
    database,
    getCurrentUserDataScope,
    commitFinancialActionGroupLocally:
      createFinancialActionFoundationRepository({
        database,
        registry: METAL_FINANCIAL_ACTION_REGISTRY,
        getCurrentUserDataScope,
        assertExpectedCurrentUser,
      }).commitFinancialActionGroupLocally,
    createEnvelope: (input, payload): FinancialActionEnvelopeV1 =>
      createMetalFinancialActionEnvelope({
        actionId: input.actionId,
        userId: input.userId,
        holdingId: input.holdingId,
        kind: "undo",
        expectedHoldingRevision: input.expectedFinancialRevision,
        occurredAt: input.occurredAt,
        domainPayload: payload,
        validationInput: {
          latestAllowedCalendarDate: input.occurredAt.slice(0, 10),
        },
      }),
    hashProvider: sha256Provider,
  });
}
