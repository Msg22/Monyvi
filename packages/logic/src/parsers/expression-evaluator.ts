interface OperatorDefinition {
  readonly precedence: number;
  readonly apply: (left: number, right: number) => number | null;
}

const OPERATORS: Readonly<Record<string, OperatorDefinition>> = {
  "+": {
    precedence: 1,
    apply: (left, right) => left + right,
  },
  "-": {
    precedence: 1,
    apply: (left, right) => left - right,
  },
  "*": {
    precedence: 2,
    apply: (left, right) => left * right,
  },
  "/": {
    precedence: 2,
    apply: (left, right) => (right === 0 ? null : left / right),
  },
};

const NUMBER_TOKEN_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

function isOperator(value: string): value is keyof typeof OPERATORS {
  return Object.prototype.hasOwnProperty.call(OPERATORS, value);
}

function readNumberToken(
  expression: string,
  startIndex: number
): { readonly value: number; readonly nextIndex: number } | null {
  let cursor = startIndex;
  while (
    cursor < expression.length &&
    /[0-9.]/.test(expression.charAt(cursor))
  ) {
    cursor++;
  }

  const rawToken = expression.slice(startIndex, cursor);
  if (!NUMBER_TOKEN_PATTERN.test(rawToken)) {
    return null;
  }

  const value = Number(rawToken);
  if (!Number.isFinite(value)) {
    return null;
  }

  return { value, nextIndex: cursor };
}

function applyTopOperator(values: number[], operators: string[]): boolean {
  const operator = operators.pop();
  const right = values.pop();
  const left = values.pop();

  if (
    operator === undefined ||
    right === undefined ||
    left === undefined ||
    !isOperator(operator)
  ) {
    return false;
  }

  const result = OPERATORS[operator].apply(left, right);
  if (result === null || !Number.isFinite(result)) {
    return false;
  }

  values.push(result);
  return true;
}

function normalizeResult(value: number): number | null {
  const normalized = Number(value.toFixed(10));
  return Number.isFinite(normalized) ? normalized : null;
}

export function evaluateAmountExpression(expression: string): number | null {
  const sanitized = expression.replace(/\s+/g, "");
  if (sanitized.length === 0) {
    return null;
  }

  const values: number[] = [];
  const operators: string[] = [];
  let cursor = 0;
  let expectsNumber = true;

  while (cursor < sanitized.length) {
    const char = sanitized.charAt(cursor);

    if (expectsNumber) {
      const numberToken = readNumberToken(sanitized, cursor);
      if (numberToken === null) {
        return null;
      }
      values.push(numberToken.value);
      cursor = numberToken.nextIndex;
      expectsNumber = false;
      continue;
    }

    if (!isOperator(char)) {
      return null;
    }

    while (
      operators.length > 0 &&
      OPERATORS[operators[operators.length - 1]].precedence >=
        OPERATORS[char].precedence
    ) {
      if (!applyTopOperator(values, operators)) {
        return null;
      }
    }

    operators.push(char);
    cursor++;
    expectsNumber = true;
  }

  if (expectsNumber) {
    return null;
  }

  while (operators.length > 0) {
    if (!applyTopOperator(values, operators)) {
      return null;
    }
  }

  return values.length === 1 ? normalizeResult(values[0]) : null;
}
