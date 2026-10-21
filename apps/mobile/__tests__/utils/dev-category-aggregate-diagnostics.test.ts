import {
  buildCategorySnapshotDiagnostics,
  emitCategorySnapshotDiagnostics,
  type CategoryDiagnosticRow,
  type CategoryLevelAggregate,
} from "../../utils/dev-category-aggregate-diagnostics";
import { logger } from "../../utils/logger";

jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const debugSpy = logger.debug as jest.MockedFunction<typeof logger.debug>;

function row(
  overrides: Partial<CategoryDiagnosticRow> & {
    readonly id: string;
    readonly level: number;
  }
): CategoryDiagnosticRow {
  return {
    type: "EXPENSE",
    systemName: "groceries",
    ...overrides,
  };
}

function levelAggregate(
  diagnostics: ReturnType<typeof buildCategorySnapshotDiagnostics>,
  level: number
): CategoryLevelAggregate | undefined {
  return diagnostics.levels.find((entry) => entry.level === level);
}

function setDevFlag(value: boolean): void {
  Object.defineProperty(globalThis, "__DEV__", {
    value,
    configurable: true,
    writable: true,
  });
}

function emittedMessage(): string {
  const call = debugSpy.mock.calls[0];
  if (!call) throw new Error("expected one debug emission");
  const [message] = call;
  if (typeof message !== "string") {
    throw new Error("expected the emitted message to be a string");
  }
  return message;
}

describe("buildCategorySnapshotDiagnostics", (): void => {
  it("reports a clean snapshot without duplicate id or logical keys", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({ id: "l1-food", level: 1, systemName: "food_drinks" }),
      row({ id: "l2-groceries", level: 2, parentId: "l1-food" }),
    ];

    const diagnostics = buildCategorySnapshotDiagnostics(rows);

    expect(diagnostics.totalRows).toBe(2);
    expect(diagnostics.distinctIds).toBe(2);
    expect(diagnostics.duplicateIdKeys).toBe(0);
    expect(diagnostics.otherLevelRows).toBe(0);
    expect(diagnostics.systemScopeRows).toBe(2);
    expect(diagnostics.userScopedRows).toBe(0);
    expect(levelAggregate(diagnostics, 1)).toMatchObject({
      rows: 1,
      distinctIds: 1,
      duplicateIdKeys: 0,
      duplicateLogicalSystemKeys: 0,
    });
    expect(levelAggregate(diagnostics, 2)).toMatchObject({
      rows: 1,
      distinctIds: 1,
      duplicateIdKeys: 0,
      distinctLogicalSystemKeys: 1,
      duplicateLogicalSystemKeys: 0,
    });
  });

  it("counts a repeated id as a duplicate id key", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({ id: "l2-groceries", level: 2, parentId: "l1-food" }),
      row({ id: "l2-groceries", level: 2, parentId: "l1-food" }),
    ];

    const diagnostics = buildCategorySnapshotDiagnostics(rows);

    expect(diagnostics.totalRows).toBe(2);
    expect(diagnostics.distinctIds).toBe(1);
    expect(diagnostics.duplicateIdKeys).toBe(1);
    expect(levelAggregate(diagnostics, 2)).toMatchObject({
      rows: 2,
      distinctIds: 1,
      duplicateIdKeys: 1,
      duplicateLogicalSystemKeys: 1,
    });
  });

  it("counts distinct ids that share one logical system key as a logical duplicate", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({ id: "l2-groceries-a", level: 2, parentId: "l1-food" }),
      row({ id: "l2-groceries-b", level: 2, parentId: "l1-food" }),
    ];

    const diagnostics = buildCategorySnapshotDiagnostics(rows);

    expect(diagnostics.totalRows).toBe(2);
    expect(diagnostics.distinctIds).toBe(2);
    expect(diagnostics.duplicateIdKeys).toBe(0);
    expect(levelAggregate(diagnostics, 2)).toMatchObject({
      rows: 2,
      distinctIds: 2,
      duplicateIdKeys: 0,
      distinctLogicalSystemKeys: 1,
      duplicateLogicalSystemKeys: 1,
    });
  });

  it("isolates a level 2 duplication while level 1 stays clean", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({ id: "l1-utilities", level: 1, systemName: "utilities_bills" }),
      row({
        id: "l2-electricity-a",
        level: 2,
        systemName: "electricity",
        parentId: "l1-utilities",
      }),
      row({
        id: "l2-electricity-b",
        level: 2,
        systemName: "electricity",
        parentId: "l1-utilities",
      }),
    ];

    const diagnostics = buildCategorySnapshotDiagnostics(rows);

    expect(levelAggregate(diagnostics, 1)).toMatchObject({
      rows: 1,
      duplicateIdKeys: 0,
      duplicateLogicalSystemKeys: 0,
    });
    expect(levelAggregate(diagnostics, 2)).toMatchObject({
      rows: 2,
      duplicateIdKeys: 0,
      duplicateLogicalSystemKeys: 1,
    });
  });

  it("keeps a user-scoped category that shares a system name out of the duplicate count", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({
        id: "system-child",
        level: 2,
        systemName: "electricity",
        parentId: "l1-utilities",
      }),
      row({
        id: "custom-child",
        level: 2,
        systemName: "electricity",
        parentId: "l1-utilities",
        userId: "user-1",
      }),
    ];

    const diagnostics = buildCategorySnapshotDiagnostics(rows);

    expect(diagnostics.systemScopeRows).toBe(1);
    expect(diagnostics.userScopedRows).toBe(1);
    expect(levelAggregate(diagnostics, 2)).toMatchObject({
      rows: 2,
      distinctLogicalSystemKeys: 2,
      duplicateLogicalSystemKeys: 0,
    });
  });

  it("emits counts only and never raw row values", (): void => {
    const rows: readonly CategoryDiagnosticRow[] = [
      row({
        id: "sensitive-id-value",
        level: 2,
        systemName: "electricity",
        parentId: "parent-id-value",
        userId: "user-id-value",
      }),
    ];

    const serialized = JSON.stringify(buildCategorySnapshotDiagnostics(rows));

    expect(serialized).not.toContain("sensitive-id-value");
    expect(serialized).not.toContain("parent-id-value");
    expect(serialized).not.toContain("user-id-value");
    expect(serialized).not.toContain("electricity");
    expect(serialized).not.toContain("EXPENSE");
  });
});

describe("emitCategorySnapshotDiagnostics", (): void => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "__DEV__"
  );

  afterEach((): void => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "__DEV__", originalDescriptor);
    }
    debugSpy.mockClear();
  });

  it("emits one complete JSON string event with counts only", (): void => {
    setDevFlag(true);

    emitCategorySnapshotDiagnostics([
      row({ id: "l2-groceries-a", level: 2, parentId: "l1-food" }),
      row({ id: "l2-groceries-b", level: 2, parentId: "l1-food" }),
    ]);

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const message = emittedMessage();
    const parsed = JSON.parse(message) as {
      event: string;
      totalRows: number;
      distinctIds: number;
      duplicateIdKeys: number;
      levels: Array<{ level: number; duplicateLogicalSystemKeys: number }>;
    };
    expect(parsed.event).toBe("categories.snapshotDiagnostics");
    expect(parsed.totalRows).toBe(2);
    expect(parsed.distinctIds).toBe(2);
    expect(parsed.duplicateIdKeys).toBe(0);
    expect(parsed.levels[1]).toMatchObject({
      level: 2,
      rows: 2,
      duplicateLogicalSystemKeys: 1,
    });
    expect(message).not.toContain("l2-groceries-a");
    expect(message).not.toContain("l1-food");
    expect(message).not.toContain("groceries");
  });

  it("emits nothing outside development builds", (): void => {
    setDevFlag(false);

    emitCategorySnapshotDiagnostics([
      row({ id: "l2-groceries", level: 2, parentId: "l1-food" }),
    ]);

    expect(debugSpy).not.toHaveBeenCalled();
  });
});
