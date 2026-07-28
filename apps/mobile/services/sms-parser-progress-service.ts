import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { AiParseProgress } from "./ai-sms-parser-service";

export async function publishCompletedSmsParserTransactions(
  onProgress: ((progress: AiParseProgress) => void | Promise<void>) | undefined,
  transactions: readonly ParsedSmsTransaction[],
  hasPendingAiWork: boolean
): Promise<void> {
  if (!onProgress || transactions.length === 0) return;

  await onProgress({
    chunksCompleted: 0,
    totalChunks: hasPendingAiWork ? 1 : 0,
    transactionsSoFar: transactions.length,
    completedTransactions: transactions,
    chunkDurationMs: 0,
  });
}
