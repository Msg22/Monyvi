/**
 * #395 T038 regression: NativeWind v4 opacity/shadow utilities must not be
 * attached directly to TouchableOpacity or Pressable.
 *
 * Structural TSX AST guard, not a rendered/native crash test.
 * Deliberately limited to the five feature-owned presentation modules.
 * Shared helpers with computed runtime class strings need separate review.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const REVIEW_COMPONENT_DIR = path.resolve(
  __dirname,
  "../../components/transaction-review"
);
const REVIEW_FILES = [
  "AccountChoiceSheet.tsx",
  "CurrencyConfirmationSheet.tsx",
  "account-review-choice-presentation.tsx",
  "shared-account-presentation.tsx",
  "DefaultAccountInfo.tsx",
];
const MAX_STATIC_VARIANTS = 256;

interface TouchableViolation {
  readonly component: string;
  readonly file: string;
  readonly line: number;
  readonly utility: string;
}

interface SourceInspection {
  readonly touchableCount: number;
  readonly violations: readonly TouchableViolation[];
}

function combine(
  left: readonly string[],
  right: readonly string[]
): readonly string[] {
  if (left.length * right.length > MAX_STATIC_VARIANTS) {
    throw new Error("NativeWind className static variant budget exceeded");
  }
  return [...new Set(left.flatMap((a) => right.map((b) => a + b)))];
}

function templateVariants(
  expression: ts.TemplateExpression,
  depth: number
): readonly string[] {
  let options: readonly string[] = [expression.head.text];
  for (const span of expression.templateSpans) {
    options = combine(options, classVariants(span.expression, depth + 1));
    options = options.map((value) => value + span.literal.text);
  }
  return options;
}

function binaryVariants(
  expression: ts.BinaryExpression,
  depth: number
): readonly string[] {
  const operator = expression.operatorToken.kind;
  const right = classVariants(expression.right, depth + 1);
  if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
    return ["", ...right];
  }
  const left = classVariants(expression.left, depth + 1);
  if (operator === ts.SyntaxKind.PlusToken) return combine(left, right);
  if (
    operator === ts.SyntaxKind.BarBarToken ||
    operator === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return [...new Set([...left, ...right])];
  }
  return [" "];
}

/**
 * Expand possible STATIC class strings, preserving concatenated tokens.
 * Unknown runtime values are word boundaries, not invented class names.
 */
function classVariants(
  expression: ts.Expression,
  depth = 0
): readonly string[] {
  if (depth > 16) {
    throw new Error("NativeWind className expression nesting exceeded");
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return classVariants(expression.expression, depth + 1);
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return [expression.text];
  }
  if (ts.isConditionalExpression(expression)) {
    return [...new Set([
      ...classVariants(expression.whenTrue, depth + 1),
      ...classVariants(expression.whenFalse, depth + 1),
    ])];
  }
  if (ts.isTemplateExpression(expression)) {
    return templateVariants(expression, depth + 1);
  }
  if (ts.isBinaryExpression(expression)) {
    return binaryVariants(expression, depth + 1);
  }
  return [" "];
}

function classNameVariants(
  attribute: ts.JsxAttribute
): readonly string[] {
  const initializer = attribute.initializer;
  if (initializer === undefined) return [];
  if (ts.isStringLiteral(initializer)) return [initializer.text];
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return classVariants(initializer.expression);
  }
  return [];
}

/** Strip variant prefixes, but not colons inside arbitrary-value brackets. */
function baseUtility(token: string): string {
  let bracketDepth = 0;
  let startsAt = 0;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth -= 1;
    else if (character === ":" && bracketDepth === 0) startsAt = index + 1;
  }
  return token.slice(startsAt).replace(/^!/, "");
}

function hasBackgroundOpacityModifier(utility: string): boolean {
  if (!utility.startsWith("bg-")) return false;
  let bracketDepth = 0;
  for (const character of utility) {
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth -= 1;
    else if (character === "/" && bracketDepth === 0) return true;
  }
  return false;
}

/** Exact documented NativeWind v4 Touchable/Pressable crash utility families. */
function isForbiddenTouchableClass(token: string): boolean {
  const utility = baseUtility(token);
  return (
    /^shadow(?:-|$)/u.test(utility) ||
    /^opacity(?:-|$)/u.test(utility) ||
    hasBackgroundOpacityModifier(utility)
  );
}

function inspectTouchableClasses(
  file: string,
  source: string
): SourceInspection {
  const tree = ts.createSourceFile(
    file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
  );
  const violations: TouchableViolation[] = [];
  let touchableCount = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(tree).split(".").pop();
      if (name === "TouchableOpacity" || name === "Pressable") {
        touchableCount += 1;
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) ||
              attribute.name.getText(tree) !== "className") continue;
          const line = tree.getLineAndCharacterOfPosition(
            attribute.getStart(tree)
          ).line + 1;
          const possibilities = classNameVariants(attribute);
          const unsafe = new Set(
            possibilities.flatMap((classes) => classes.split(/\s+/u))
              .filter(isForbiddenTouchableClass)
          );
          for (const utility of unsafe) {
            violations.push({ file, component: name, line, utility });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { touchableCount, violations };
}

function signatures(result: SourceInspection): readonly string[] {
  return result.violations.map((hit) =>
    hit.component + ":" + hit.utility
  ).sort();
}

describe("#395 T038 NativeWind touchable class safety", () => {
  it("detects literal, conditional, joined and templated dangerous utilities", () => {
    const tick = String.fromCharCode(96);
    const sample = [
      "<>",
      '<TouchableOpacity className="px-3 shadow-md hover:opacity-60" activeOpacity={0.7} />',
      '<Pressable className={selected ? "dark:bg-nileGreen-900/20" : "border-slate-200/40"} />',
      '<Pressable className={' + tick + 'p-2 $' +
        '{selected ? "dark:shadow-lg" : "focus:opacity-20"}' + tick + '} />',
      '<TouchableOpacity className={"bg-" + "black/60"} />',
      '<Pressable className={selected && "active:bg-white/[0.35]"} />',
      "</>",
    ].join("\n");
    const inspection = inspectTouchableClasses("synthetic-bad.tsx", sample);
    expect(inspection.touchableCount).toBe(5);
    expect(signatures(inspection)).toEqual([
      "Pressable:active:bg-white/[0.35]",
      "Pressable:dark:bg-nileGreen-900/20",
      "Pressable:dark:shadow-lg",
      "Pressable:focus:opacity-20",
      "TouchableOpacity:bg-black/60",
      "TouchableOpacity:hover:opacity-60",
      "TouchableOpacity:shadow-md",
    ].sort());
    expect(inspection.violations.every((hit) => hit.line > 0)).toBe(true);
  });

  it("allows activeOpacity, solid backgrounds, border/text alpha and alpha on child View", () => {
    const sample = [
      "<>",
      '<TouchableOpacity activeOpacity={0.65} className="bg-nileGreen-600 border-slate-300/25 text-white/80">',
      '  <View className="dark:bg-black/60 opacity-70 shadow-xl" />',
      '</TouchableOpacity>',
      '<Pressable className={selected ? "dark:border-white/25 text-white/50" : "bg-surface"} />',
      '<TouchableOpacity className="bg-[url(https://example.com/asset.png)]" />',
      "</>",
    ].join("\n");
    const inspection = inspectTouchableClasses("synthetic-safe.tsx", sample);
    expect(inspection.touchableCount).toBe(3);
    expect(inspection.violations).toEqual([]);
  });

  it.each(REVIEW_FILES)(
    "forbids direct alpha backgrounds, opacity and shadows on %s touchables",
    (file): void => {
      const source = readFileSync(
        path.join(REVIEW_COMPONENT_DIR, file), "utf8"
      );
      const inspected = inspectTouchableClasses(file, source);
      expect(inspected.touchableCount).toBeGreaterThan(0);
      const diagnostics = inspected.violations.map((hit) =>
        hit.file + ":" + hit.line + " <" + hit.component + "> " + hit.utility
      );
      expect(diagnostics).toEqual([]);
    }
  );
});
