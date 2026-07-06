/**
 * Formats a raw numeric string with commas for thousands separators,
 * preserving existing decimal components.
 */
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
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function evaluateAmountExpression(expression: string): number | null {
  const tokens = tokenizeAmountExpression(expression);
  if (tokens === null || tokens.length === 0) {
    return null;
  }

  const values: number[] = [];
  const operators: string[] = [];

  for (const token of tokens) {
    if (typeof token === "number") {
      values.push(token);
      continue;
    }

    while (
      operators.length > 0 &&
      getOperatorPrecedence(operators[operators.length - 1]) >=
        getOperatorPrecedence(token)
    ) {
      if (!applyTopOperator(values, operators)) {
        return null;
      }
    }
    operators.push(token);
  }

  while (operators.length > 0) {
    if (!applyTopOperator(values, operators)) {
      return null;
    }
  }

  const result = values[0];
  return values.length === 1 && Number.isFinite(result) ? result : null;
}

function tokenizeAmountExpression(
  expression: string
): Array<number | string> | null {
  const normalized = expression.replace(/,/g, "").replace(/\s+/g, "");
  const tokens: Array<number | string> = [];
  let index = 0;
  let expectsNumber = true;

  while (index < normalized.length) {
    const char = normalized[index];
    if (isOperator(char) && !expectsNumber) {
      tokens.push(char);
      expectsNumber = true;
      index += 1;
      continue;
    }

    const sign = char === "-" && expectsNumber ? "-" : "";
    const numberStart = sign ? index + 1 : index;
    const match = normalized.slice(numberStart).match(/^(?:\d+\.?\d*|\.\d+)/);
    if (!match) {
      return null;
    }

    const value = Number(`${sign}${match[0]}`);
    if (!Number.isFinite(value)) {
      return null;
    }

    tokens.push(value);
    expectsNumber = false;
    index = numberStart + match[0].length;
  }

  return expectsNumber ? null : tokens;
}

function isOperator(value: string): boolean {
  return value === "+" || value === "-" || value === "*" || value === "/";
}

function getOperatorPrecedence(operator: string): number {
  return operator === "*" || operator === "/" ? 2 : 1;
}

function applyTopOperator(values: number[], operators: string[]): boolean {
  const operator = operators.pop();
  const right = values.pop();
  const left = values.pop();
  if (operator === undefined || left === undefined || right === undefined) {
    return false;
  }

  if (operator === "+") values.push(left + right);
  if (operator === "-") values.push(left - right);
  if (operator === "*") values.push(left * right);
  if (operator === "/") {
    if (right === 0) {
      return false;
    }
    values.push(left / right);
  }

  return true;
}
