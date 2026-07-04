/**
 * Formats a raw numeric string with commas for thousands separators,
 * preserving existing decimal components.
 */
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000;

const STRICT_AMOUNT_INPUT_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

export function formatAmountInput(
  val: string,
  initialValue: string = ""
): string {
  if (!val) return initialValue;
  const parts = val.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Parses user input into a clean numeric string, allowing up to one decimal point.
 */
export function parseAmountInput(text: string): string {
  let cleaned = text.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = parts[0] + "." + parts.slice(1).join("");
  }
  return cleaned;
}

export function parsePositiveFiniteAmountInput(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!STRICT_AMOUNT_INPUT_PATTERN.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function isValidTransactionAmount(amount: number): boolean {
  return (
    Number.isFinite(amount) && amount > 0 && amount <= MAX_TRANSACTION_AMOUNT
  );
}
