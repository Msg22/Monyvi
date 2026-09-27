import { AccountFinancialEffect, database } from "@monyvi/db";
import * as Crypto from "expo-crypto";

import { createAccountBalanceCommandService } from "./account-balance-command-service";
import { commitFinancialActionGroupLocally } from "./financial-action-foundation-repository";

export const productionFinancialActionHashProvider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonicalText
    ),
};

export const productionFinancialActionIdProvider = {
  createId: (): string => Crypto.randomUUID(),
};

export const productionAccountBalanceCommandService =
  createAccountBalanceCommandService({
    foundationRepository: { commitFinancialActionGroupLocally },
    prepareEffectCreate: (input) =>
      database
        .get<AccountFinancialEffect>("account_financial_effects")
        .prepareCreate((record) => {
          record._raw.id = input.effectId;
          record.acceptedAccountRevision = input.acceptedAccountRevision;
          record.accountId = input.accountId;
          record.actionId = input.actionId;
          record.amountMinorUnits = input.amountMinorUnits;
          record.compensatedAt = null;
          record.currency = input.currency;
          record.deleted = false;
          record.domain = input.domain;
          record.isEffective = true;
          record.kind = input.kind;
          record.reversesEffectId = null;
          record.userId = input.userId;
        }),
  });
