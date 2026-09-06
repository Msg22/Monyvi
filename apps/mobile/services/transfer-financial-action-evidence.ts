import type { CurrencyType } from "@monyvi/db";
import type { Model } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  type CanonicalJsonValue,
} from "@monyvi/logic";

export interface TransferAfter extends Readonly<
  Record<string, CanonicalJsonValue>
> {
  readonly amountMinorUnits: string;
  readonly convertedAmountMinorUnits: string | null;
  readonly createdAt: string;
  readonly currency: CurrencyType;
  readonly date: string;
  readonly deleted: boolean;
  readonly exchangeRate: string | null;
  readonly fromAccountId: string;
  readonly id: string;
  readonly notes: string | null;
  readonly smsFingerprint: string | null;
  readonly toAccountId: string;
}

function readRaw(raw: Readonly<Model["_raw"]>, key: string): unknown {
  return (raw as unknown as Readonly<Record<string, unknown>>)[key];
}

function currencyPlaces(currency: CurrencyType): number {
  return CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION;
}

export function assertRawTransferMatches(
  raw: Readonly<Model["_raw"]>,
  expected: TransferAfter,
  destinationCurrency: CurrencyType,
  invalidPlanCode: string
): void {
  const destinationMinorUnits = expected.convertedAmountMinorUnits;
  const exactEntries: ReadonlyArray<readonly [string, unknown]> = [
    [
      "amount",
      Number(
        fromMinorUnits(
          expected.amountMinorUnits,
          currencyPlaces(expected.currency)
        )
      ),
    ],
    [
      "converted_amount",
      destinationMinorUnits === null
        ? null
        : Number(
            fromMinorUnits(
              destinationMinorUnits,
              currencyPlaces(destinationCurrency)
            )
          ),
    ],
    ["created_at", Date.parse(expected.createdAt)],
    ["currency", expected.currency],
    ["date", new Date(`${expected.date}T00:00:00`).getTime()],
    ["deleted", expected.deleted],
    [
      "exchange_rate",
      expected.exchangeRate === null ? null : Number(expected.exchangeRate),
    ],
    ["from_account_id", expected.fromAccountId],
    ["notes", expected.notes],
    ["sms_fingerprint", expected.smsFingerprint],
    ["to_account_id", expected.toAccountId],
  ];
  if (exactEntries.some(([key, value]) => readRaw(raw, key) !== value)) {
    throw new Error(invalidPlanCode);
  }
}
