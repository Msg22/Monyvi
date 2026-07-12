import {
  isKnownFinancialSender,
  type ReviewableTransaction,
  type SelectableEgyptianInstitutionId,
} from "@monyvi/logic";

import { getEgyptianInstitutionAsset } from "@/constants/egyptian-institution-assets";

export interface TransactionReviewProviderPresentation {
  readonly institutionId: SelectableEgyptianInstitutionId;
  readonly asset: ReturnType<typeof getEgyptianInstitutionAsset>;
}

export function resolveTransactionReviewProvider(
  transaction: ReviewableTransaction
): TransactionReviewProviderPresentation | null {
  if (transaction.source !== "SMS") {
    return null;
  }

  const smsTransaction = transaction as ReviewableTransaction & {
    readonly senderDisplayName?: string;
  };
  const sender = smsTransaction.senderDisplayName ?? transaction.originLabel;
  const institution = isKnownFinancialSender(sender);

  if (
    !institution?.selectable ||
    (institution.type !== "bank" && institution.type !== "wallet")
  ) {
    return null;
  }

  const institutionId = institution.id as SelectableEgyptianInstitutionId;
  return {
    institutionId,
    asset: getEgyptianInstitutionAsset(institutionId, institution.type),
  };
}
