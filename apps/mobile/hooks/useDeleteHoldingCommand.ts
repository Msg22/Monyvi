import * as Crypto from "expo-crypto";
import { useCallback, useMemo, useRef } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import type {
  DeleteMetalHoldingHookCommand,
  DeleteMetalHoldingRequestIds,
} from "@/hooks/useDeleteMetalHolding";
import { useDatabase } from "@/providers/DatabaseProvider";
import {
  METAL_FINANCIAL_ACTION_REGISTRY,
  createMetalFinancialActionEnvelope,
} from "@/services/metal-financial-action-adapter";
import {
  createDeleteMetalHoldingCommandService,
  type DeleteMetalHoldingCommandInput,
} from "@/services/delete-metal-holding-command-service";
import {
  readDeleteHoldingConcurrencyToken,
  type DeleteHoldingConcurrencyToken,
} from "@/services/delete-metal-holding-concurrency-service";
import { createFinancialActionFoundationRepository } from "@/services/financial-action-foundation-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "@/services/user-data-access";

export interface DeleteHoldingCommand extends DeleteMetalHoldingHookCommand {
  readonly input: DeleteMetalHoldingCommandInput;
}

export interface UseDeleteHoldingCommandInput {
  readonly createCommand: (
    ids: DeleteMetalHoldingRequestIds
  ) => DeleteHoldingCommand;
  readonly execute: (command: DeleteMetalHoldingHookCommand) => Promise<void>;
  readonly createId: () => string;
}

export interface UseDeleteHoldingCommandResult {
  readonly input: UseDeleteHoldingCommandInput;
  readonly ensureToken: () => Promise<DeleteHoldingConcurrencyToken | null>;
}

export function useDeleteHoldingCommand(
  holdingId: string | undefined
): UseDeleteHoldingCommandResult {
  const database = useDatabase();
  const { userId } = useCurrentUser();
  const tokenRef = useRef<DeleteHoldingConcurrencyToken | null>(null);

  // Reads the live revision on demand instead of caching it in state, so
  // confirm and retry always build against the freshest token and never a
  // stale render closure. A null result surfaces through command
  // construction as an unavailable command with an explicit retry.
  const ensureToken =
    useCallback(async (): Promise<DeleteHoldingConcurrencyToken | null> => {
      if (!holdingId || !userId) {
        tokenRef.current = null;
        return null;
      }
      try {
        const next = await readDeleteHoldingConcurrencyToken(
          database,
          userId,
          holdingId
        );
        tokenRef.current = next;
        return next;
      } catch {
        tokenRef.current = null;
        return null;
      }
    }, [database, holdingId, userId]);

  const service = useMemo(
    () =>
      createDeleteMetalHoldingCommandService({
        database,
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
            kind: "delete",
            expectedHoldingRevision: input.expectedFinancialRevision,
            occurredAt: input.occurredAt,
            domainPayload: payload,
            validationInput: {
              latestAllowedCalendarDate: input.latestAllowedCalendarDate,
            },
          }),
        hashProvider: {
          digestUtf8: (canonicalText: string): Promise<string> =>
            Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              canonicalText
            ),
        },
      }),
    [database]
  );

  const createCommand = useCallback(
    (ids: DeleteMetalHoldingRequestIds): DeleteHoldingCommand => {
      const token = tokenRef.current;
      if (!holdingId || !userId || !token)
        throw new Error("metal_delete_unavailable");
      const occurredAt = new Date().toISOString();
      return {
        ids,
        input: {
          actionId: ids.actionId,
          actionEvidenceId: ids.actionEvidenceId,
          lifecycleEventId: ids.lifecycleEventId,
          predecessorEventId: token.predecessorEventId,
          holdingId,
          userId,
          occurredAt,
          latestAllowedCalendarDate: occurredAt.slice(0, 10),
          expectedFinancialRevision: token.expectedFinancialRevision,
        },
      };
    },
    [holdingId, userId]
  );

  const execute = useCallback(
    (command: DeleteMetalHoldingHookCommand): Promise<void> =>
      // createCommand above always produces a DeleteHoldingCommand, and the
      // submission hook passes that same object back here untouched.
      service
        .delete((command as DeleteHoldingCommand).input)
        .then((): void => undefined),
    [service]
  );

  const createId = useCallback((): string => Crypto.randomUUID(), []);

  const input = useMemo<UseDeleteHoldingCommandInput>(
    () => ({ createCommand, execute, createId }),
    [createCommand, createId, execute]
  );

  return { input, ensureToken };
}
