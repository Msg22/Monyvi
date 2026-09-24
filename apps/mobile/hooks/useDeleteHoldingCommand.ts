import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  readonly refreshToken: () => Promise<void>;
}

export function useDeleteHoldingCommand(
  holdingId: string | undefined
): UseDeleteHoldingCommandResult {
  const database = useDatabase();
  const { userId } = useCurrentUser();
  const [token, setToken] = useState<DeleteHoldingConcurrencyToken | null>(
    null
  );

  const loadToken =
    useCallback(async (): Promise<DeleteHoldingConcurrencyToken | null> => {
      if (!holdingId || !userId) {
        setToken(null);
        return null;
      }
      try {
        const next = await readDeleteHoldingConcurrencyToken(
          database,
          userId,
          holdingId
        );
        setToken(next);
        return next;
      } catch {
        setToken(null);
        return null;
      }
    }, [database, holdingId, userId]);

  useEffect(() => {
    void loadToken();
  }, [loadToken]);

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
    [holdingId, token, userId]
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

  const refreshToken = useCallback(async (): Promise<void> => {
    await loadToken();
  }, [loadToken]);

  const input = useMemo<UseDeleteHoldingCommandInput>(
    () => ({ createCommand, execute, createId }),
    [createCommand, createId, execute]
  );

  return { input, refreshToken };
}
