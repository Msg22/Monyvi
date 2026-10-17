/**
 * #395 T075 pure deterministic synthetic benchmark — NOT RUN.
 * Exercises the actual normalized QNB/CIB fixture, canonical identity/hash,
 * reducer, and projectAccountReviewSession. Timings: Node/Jest only.
 * No production mocks, cache, DB, provider, or elapsed-time CI threshold.
 */
import { performance } from "node:perf_hooks";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../review-schemas";
import type { AccountReviewOwnedContext } from "../normalization-types";
import {
  deriveAccountReviewGroupIdentity,
  deriveAccountReviewRowIdentity,
} from "../identity";
import { incrementReviewRevision } from "../reducer-primitives";
import {
  reduceAccountReviewCommand,
  type AccountReviewCommandResult,
} from "../reducer";
import { projectAccountReviewSession } from "../read-model";
import { syntheticHashProvider } from "./normalization-fixtures";
import {
  COMMAND_IDS,
  groupByName,
  ownedContext,
  qnbCibReview,
  requireRow,
  reviewWithReadyRow,
  scope,
} from "./review-command-fixtures";

const SIZES = [
  { rows: 100, groups: 20 },
  { rows: 500, groups: 100 },
] as const;
const LINKED_ROWS_PER_GROUP = 4;
const WARMUP_ITERATIONS = 4;
const MEASURED_ITERATIONS = 20;
const NONLINEAR_DIAGNOSTIC_FACTOR = 2; // report-only, NOT a CI threshold

type Scale = (typeof SIZES)[number];
type OperationName =
  | "project"
  | "select_ready"
  | "clear_selection"
  | "confirm_group";

interface ExpectedCounts {
  readonly rows: number;
  readonly groups: number;
  readonly needsReview: number;
  readonly selected: number;
  readonly defaultAssignments: number;
  readonly pendingGroups: number;
  readonly confirmedGroups: number;
  readonly readyVisible: number;
}
interface SyntheticReviewCase {
  readonly size: Scale;
  readonly session: AccountReviewSession;
  readonly accounts: AccountReviewOwnedContext;
  readonly expected: ExpectedCounts;
}
interface TimingStats {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly warmup: number;
  readonly measured: number;
}
interface OperationMeasurement {
  readonly name: OperationName;
  readonly observedCount: number;
  readonly timing: TimingStats;
}

function expectedFor(size: Scale): ExpectedCounts {
  const pendingGroups = size.groups / 2;
  const confirmedGroups = size.groups / 2;
  return {
    rows: size.rows,
    groups: size.groups,
    needsReview: pendingGroups * LINKED_ROWS_PER_GROUP,
    selected: size.groups,
    defaultAssignments: size.groups,
    pendingGroups,
    confirmedGroups,
    readyVisible: confirmedGroups * LINKED_ROWS_PER_GROUP,
  };
}
function apply(
  state: AccountReviewSession,
  accounts: AccountReviewOwnedContext,
  command: AccountReviewCommand
): AccountReviewCommandResult {
  return reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots: accounts,
    nextUndoToken: null,
    undo: null,
  });
}
function batchCommand(
  session: AccountReviewSession,
  kind: "select_ready" | "clear_selection"
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(session),
    kind,
    filter: session.filter,
  });
}
function confirmCommand(
  session: AccountReviewSession,
  group: AccountReviewGroup
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(session),
    kind: "confirm_group",
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}
function filterCommand(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    ...scope(session),
    kind: "set_filter",
    filter,
  });
}
function accepted(result: AccountReviewCommandResult): AccountReviewSession {
  if (result.reasonCodes.length !== 0 || result.effect === "none")
    throw new Error("t075_reducer_rejected:" + result.reasonCodes.join(","));
  return result.state;
}

/**
 * Four linked members and one genuinely eligible independent default row
 * per group. Pending/confirmed QNB snapshots are derived from the ACTUAL
 * normalized QNB3/CIB1 fixture and real confirm_group reducer. Distinct group
 * and row IDs use the existing SHA-backed canonical identity helpers.
 * Fixture construction is strictly outside the timing section.
 */
async function syntheticReview(size: Scale): Promise<SyntheticReviewCase> {
  if (
    size.rows !== size.groups * (LINKED_ROWS_PER_GROUP + 1) ||
    size.groups % 2 !== 0
  )
    throw new Error("t075_size_contract_changed");
  const normalized = await qnbCibReview();
  const originalGroup = groupByName(normalized, "QNB");
  const pendingRows = originalGroup.linkedRowIds.map((id) =>
    requireRow(normalized, id)
  );
  const confirmedState = accepted(
    apply(
      normalized,
      ownedContext(normalized),
      confirmCommand(normalized, originalGroup)
    )
  );
  const confirmedGroup = groupByName(confirmedState, "QNB");
  const confirmedRows = originalGroup.linkedRowIds.map((id) =>
    requireRow(confirmedState, id)
  );
  if (
    pendingRows.length !== 3 ||
    confirmedRows.length !== 3 ||
    originalGroup.status !== "pending" ||
    confirmedGroup.status !== "confirmed" ||
    originalGroup.type === null ||
    pendingRows.some(
      (row) => row.source !== "VOICE" || row.assignment.state !== "suggested"
    ) ||
    confirmedRows.some(
      (row) =>
        row.source !== "VOICE" ||
        row.assignment.state !== "suggested" ||
        row.reviewReasons.length > 0
    )
  )
    throw new Error("t075_canonical_QNB_template_changed");

  const ready = requireRow(await reviewWithReadyRow(), COMMAND_IDS.readyRow);
  if (
    ready.source !== "VOICE" ||
    ready.assignment.state !== "existing" ||
    ready.accountEvidence.state !== "absent" ||
    ready.currency.state !== "known" ||
    ready.reviewReasons.length !== 0
  )
    throw new Error("t075_ready_voice_default_template_changed");

  const groups: AccountReviewGroup[] = [];
  const rows: AccountReviewRow[] = [];
  for (let g = 0; g < size.groups; g += 1) {
    const isConfirmed = g % 2 === 1;
    const groupTemplate = isConfirmed ? confirmedGroup : originalGroup;
    const templates = isConfirmed ? confirmedRows : pendingRows;
    const name = "QNB synthetic " + (g + 1);
    const identity = await deriveAccountReviewGroupIdentity({
      ownerId: normalized.ownerId,
      sessionId: normalized.sessionId,
      source: normalized.source,
      identity: {
        name,
        type: groupTemplate.type,
        currency: groupTemplate.currency,
        institutionId: groupTemplate.institutionId,
        providerDisplayName: groupTemplate.providerDisplayName,
        cardLast4: groupTemplate.cardLast4,
        senderNames: groupTemplate.senderNames,
      },
      hashProvider: syntheticHashProvider,
    });
    const linkedRows: AccountReviewRow[] = [];
    for (let m = 0; m < LINKED_ROWS_PER_GROUP; m += 1) {
      const template = templates[m % templates.length];
      if (
        !template ||
        template.source !== "VOICE" ||
        template.assignment.state !== "suggested"
      )
        throw new Error("t075_missing_actual_group_member");
      const rowId = await deriveAccountReviewRowIdentity({
        ownerId: normalized.ownerId,
        sessionId: normalized.sessionId,
        source: normalized.source,
        sourceRecordKey: ["t075", "QNB", String(g)],
        sourceFinancialKey: [template.sourceRef, "member", String(m)],
        occurrence: 0,
        hashProvider: syntheticHashProvider,
      });
      const selected = isConfirmed && m === 0;
      linkedRows.push({
        ...template,
        rowId,
        sourceRef: "t075:QNB:" + g + ":" + m,
        assignment: { ...template.assignment, groupId: identity.groupId },
        selected,
        revision: selected
          ? incrementReviewRevision(template.revision)
          : template.revision,
        transaction: { ...template.transaction },
      });
    }
    groups.push({
      ...groupTemplate,
      ...identity,
      name,
      suggestionRefs: ["t075:QNB:source:" + g],
      linkedRowIds: linkedRows.map((row) => row.rowId),
    });
    rows.push(...linkedRows);

    // A separate original absent-account-evidence Voice row uses the real
    // eligible EGP Cash default. It is not a fifth group member.
    const standaloneId = await deriveAccountReviewRowIdentity({
      ownerId: normalized.ownerId,
      sessionId: normalized.sessionId,
      source: normalized.source,
      sourceRecordKey: ["t075", "standalone-default", String(g)],
      sourceFinancialKey: [ready.sourceRef, "default", String(g)],
      occurrence: 0,
      hashProvider: syntheticHashProvider,
    });
    const selectedDefault = g % 2 === 0;
    rows.push({
      ...ready,
      rowId: standaloneId,
      sourceRef: "t075:default:" + g,
      selected: selectedDefault,
      revision: selectedDefault
        ? incrementReviewRevision(ready.revision)
        : ready.revision,
      assignment: {
        ...ready.assignment,
        accountId: COMMAND_IDS.cashAccount,
        origin: "default",
        currency: "EGP",
      },
      hasUserAccountOverride: false,
      transaction: { ...ready.transaction },
    });
  }
  const expected = expectedFor(size);
  const generation = (expected.confirmedGroups + expected.selected).toString();
  const session = accountReviewSessionSchema.parse({
    ...normalized,
    rows,
    groups,
    removedEvidenceKeys: [],
    filter: "all",
    revision: generation,
    operationGeneration: generation,
    saveIntent: null,
  });
  return { size, session, accounts: ownedContext(session), expected };
}

function assertStructure(fixture: SyntheticReviewCase): void {
  const { session, expected } = fixture;
  expect(session.rows).toHaveLength(expected.rows);
  expect(session.groups).toHaveLength(expected.groups);
  expect(new Set(session.rows.map((r) => r.rowId)).size).toBe(expected.rows);
  expect(new Set(session.groups.map((g) => g.groupId)).size).toBe(
    expected.groups
  );
  expect(new Set(session.groups.map((g) => g.evidenceKey)).size).toBe(
    expected.groups
  );
  expect(
    session.rows.every(
      (r) =>
        r.source === "VOICE" &&
        r.sourceFingerprint === null &&
        r.currency.state === "known"
    )
  ).toBe(true);
  const byId = new Map(session.rows.map((row) => [row.rowId, row]));
  const linked = new Set<string>();
  for (const group of session.groups) {
    expect(group.linkedRowIds).toHaveLength(LINKED_ROWS_PER_GROUP);
    expect(group.status === "pending" || group.status === "confirmed").toBe(
      true
    );
    for (const id of group.linkedRowIds) {
      expect(linked.has(id)).toBe(false);
      linked.add(id);
      const row = byId.get(id);
      if (!row || row.assignment.state !== "suggested")
        throw new Error("t075_reciprocal_group_not_present");
      expect(row.assignment.groupId).toBe(group.groupId);
      expect(row.assignment.groupRevision).toBe(group.revision);
      expect(row.assignment.confirmation).toBe(group.status);
    }
  }
  expect(linked.size).toBe(expected.groups * LINKED_ROWS_PER_GROUP);
  const independent = session.rows.filter((row) => !linked.has(row.rowId));
  expect(independent).toHaveLength(expected.groups);
  expect(
    independent.every(
      (row) =>
        row.assignment.state === "existing" &&
        row.assignment.origin === "default" &&
        row.assignment.accountId === COMMAND_IDS.cashAccount
    )
  ).toBe(true);
  accountReviewSessionSchema.parse(session);
}

function assertProjection(fixture: SyntheticReviewCase): void {
  const { session, accounts, expected } = fixture;
  const model = projectAccountReviewSession({
    session,
    accountSnapshots: accounts,
  });
  expect(model.summary).toEqual({
    totalCount: expected.rows,
    distinctNeedsReviewCount: expected.needsReview,
    selectedCount: expected.selected,
    pendingGroupCount: expected.pendingGroups,
    confirmedGroupCount: expected.confirmedGroups,
    defaultAssignmentCount: expected.defaultAssignments,
  });
  expect(model.visibleRowIds).toEqual(session.rows.map((row) => row.rowId));
  expect(model.readyVisibleRowIds).toHaveLength(expected.readyVisible);
  expect(model.groupSummaries).toHaveLength(expected.groups);
  expect(
    model.groupSummaries.filter(
      (g) =>
        g.status === "pending" &&
        g.liveLinkedRowIds.length === LINKED_ROWS_PER_GROUP
    )
  ).toHaveLength(expected.pendingGroups);
  expect(
    model.groupSummaries.filter(
      (g) =>
        g.status === "confirmed" &&
        g.liveLinkedRowIds.length === LINKED_ROWS_PER_GROUP
    )
  ).toHaveLength(expected.confirmedGroups);
  expect(
    model.readyVisibleRowIds.every((id) => {
      const row = session.rows.find((item) => item.rowId === id);
      return (
        row !== undefined && !row.selected && row.reviewReasons.length === 0
      );
    })
  ).toBe(true);
}

function percentile(sorted: readonly number[], fraction: number): number {
  const value = sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  if (value === undefined) throw new Error("t075_empty_timing_samples");
  return value;
}
function sample(action: () => number): {
  readonly observedCount: number;
  readonly timing: TimingStats;
} {
  let observedCount = 0;
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) observedCount = action();
  const measurements: number[] = [];
  for (let i = 0; i < MEASURED_ITERATIONS; i += 1) {
    const started = performance.now();
    observedCount = action();
    measurements.push(performance.now() - started);
  }
  const ordered = measurements.slice().sort((a, b) => a - b);
  const middle = ordered.length / 2;
  const low = ordered[middle - 1];
  const high = ordered[middle];
  if (low === undefined || high === undefined)
    throw new Error("t075_invalid_median_samples");
  return {
    observedCount,
    timing: {
      medianMs: (low + high) / 2,
      p95Ms: percentile(ordered, 0.95),
      minMs: ordered[0] ?? 0,
      maxMs: ordered[ordered.length - 1] ?? 0,
      warmup: WARMUP_ITERATIONS,
      measured: MEASURED_ITERATIONS,
    },
  };
}
function timedOperations(fixture: SyntheticReviewCase): ReadonlyArray<{
  readonly name: OperationName;
  readonly expectedCount: number;
  readonly action: () => number;
}> {
  const { session, accounts, expected } = fixture;
  const ready = batchCommand(session, "select_ready");
  const withAllReady = accepted(apply(session, accounts, ready));
  const selected = accepted(
    apply(withAllReady, accounts, filterCommand(withAllReady, "selected"))
  );
  const clear = batchCommand(selected, "clear_selection");
  const pending = session.groups.find((g) => g.status === "pending");
  if (!pending) throw new Error("t075_no_pending_group");
  const confirm = confirmCommand(session, pending);
  return [
    {
      name: "project",
      expectedCount: expected.rows,
      action: () =>
        projectAccountReviewSession({
          session,
          accountSnapshots: accounts,
        }).summary.totalCount,
    },
    {
      name: "select_ready",
      expectedCount: expected.readyVisible,
      action: () => apply(session, accounts, ready).affectedRowIds.length,
    },
    {
      name: "clear_selection",
      expectedCount: expected.selected + expected.readyVisible,
      action: () => apply(selected, accounts, clear).affectedRowIds.length,
    },
    {
      name: "confirm_group",
      expectedCount: LINKED_ROWS_PER_GROUP,
      action: () => apply(session, accounts, confirm).affectedRowIds.length,
    },
  ];
}

const fixtures = new Map<number, SyntheticReviewCase>();
beforeAll(async () => {
  for (const size of SIZES) {
    fixtures.set(size.groups, await syntheticReview(size));
  }
});
function fixtureFor(groups: number): SyntheticReviewCase {
  const result = fixtures.get(groups);
  if (!result) throw new Error("t075_missing_benchmark_fixture");
  return result;
}

describe("#395 T075 pure account-review 100/20 and 500/100", () => {
  for (const size of SIZES) {
    it(
      size.rows +
        " rows / " +
        size.groups +
        " groups: real canonical identities and reciprocal group/default rows",
      () => {
        assertStructure(fixtureFor(size.groups));
      }
    );

    it(
      size.rows +
        " rows / " +
        size.groups +
        " groups: exact counts, three filters and canonical ready preview",
      () => {
        const fixture = fixtureFor(size.groups);
        assertProjection(fixture);
        const { session, accounts, expected } = fixture;
        const needs = accepted(
          apply(session, accounts, filterCommand(session, "needs_review"))
        );
        const needsModel = projectAccountReviewSession({
          session: needs,
          accountSnapshots: accounts,
        });
        expect(needsModel.summary).toEqual(
          projectAccountReviewSession({
            session,
            accountSnapshots: accounts,
          }).summary
        );
        expect(needsModel.visibleRowIds).toEqual(
          needs.rows
            .filter((row) => row.reviewReasons.length > 0)
            .map((row) => row.rowId)
        );
        expect(needsModel.visibleRowIds).toHaveLength(expected.needsReview);
        expect(needsModel.readyVisibleRowIds).toEqual([]);

        const selected = accepted(
          apply(needs, accounts, filterCommand(needs, "selected"))
        );
        const selectedModel = projectAccountReviewSession({
          session: selected,
          accountSnapshots: accounts,
        });
        expect(selectedModel.visibleRowIds).toEqual(
          selected.rows.filter((row) => row.selected).map((row) => row.rowId)
        );
        expect(selectedModel.visibleRowIds).toHaveLength(expected.selected);
        expect(selectedModel.readyVisibleRowIds).toEqual([]);
        expect(selectedModel.summary).toEqual(needsModel.summary);
      }
    );

    it(
      size.rows +
        " rows / " +
        size.groups +
        " groups: real select/clear/confirm preserve unrelated business rows",
      () => {
        const fixture = fixtureFor(size.groups);
        const { session, accounts, expected } = fixture;
        const initial = structuredClone(session);
        const selected = accepted(
          apply(session, accounts, batchCommand(session, "select_ready"))
        );
        expect(selected.rows.filter((r) => r.selected)).toHaveLength(
          expected.selected + expected.readyVisible
        );
        expect(selected.groups).toEqual(session.groups);
        const filtered = accepted(
          apply(selected, accounts, filterCommand(selected, "selected"))
        );
        const cleared = accepted(
          apply(filtered, accounts, batchCommand(filtered, "clear_selection"))
        );
        expect(cleared.rows.every((row) => !row.selected)).toBe(true);
        expect(cleared.groups).toEqual(session.groups);
        const pending = session.groups.find((g) => g.status === "pending");
        if (!pending) throw new Error("t075_missing_original_pending_group");
        const confirmed = apply(
          session,
          accounts,
          confirmCommand(session, pending)
        );
        expect(confirmed.reasonCodes).toEqual([]);
        expect(confirmed.affectedRowIds).toEqual(pending.linkedRowIds);
        expect(confirmed.affectedGroupIds).toEqual([pending.groupId]);
        expect(
          confirmed.state.groups.filter((g) => g.status === "confirmed")
        ).toHaveLength(expected.confirmedGroups + 1);
        expect(
          confirmed.state.groups.filter((g) => g.status === "pending")
        ).toHaveLength(expected.pendingGroups - 1);
        expect(confirmed.state.rows.filter((row) => row.selected)).toHaveLength(
          expected.selected
        );
        expect(session).toEqual(initial);
      }
    );
  }

  it("rebuilds stable hashed UUID/evidence identities and original synthetic financial amounts without cached state", async () => {
    const original = fixtureFor(SIZES[0].groups);
    const repeat = await syntheticReview(SIZES[0]);
    expect(repeat.session.rows.map((r) => r.rowId)).toEqual(
      original.session.rows.map((r) => r.rowId)
    );
    expect(
      repeat.session.groups.map((g) => ({
        groupId: g.groupId,
        evidenceKey: g.evidenceKey,
      }))
    ).toEqual(
      original.session.groups.map((g) => ({
        groupId: g.groupId,
        evidenceKey: g.evidenceKey,
      }))
    );
    expect(repeat.session.rows.map((r) => r.transaction.amount)).toEqual(
      original.session.rows.map((r) => r.transaction.amount)
    );
  });

  it("reports machine-only bounded median/p95 and growth diagnostics without a flaky CI speed budget", () => {
    const outcomes: Array<{
      readonly rows: number;
      readonly groups: number;
      readonly operations: readonly OperationMeasurement[];
    }> = [];
    for (const size of SIZES) {
      const fixture = fixtureFor(size.groups);
      const operations: OperationMeasurement[] = [];
      for (const op of timedOperations(fixture)) {
        const measurement = sample(op.action);
        expect(measurement.observedCount).toBe(op.expectedCount);
        expect(Number.isFinite(measurement.timing.medianMs)).toBe(true);
        expect(Number.isFinite(measurement.timing.p95Ms)).toBe(true);
        expect(measurement.timing.medianMs).toBeGreaterThanOrEqual(0);
        expect(measurement.timing.p95Ms).toBeGreaterThanOrEqual(
          measurement.timing.medianMs
        );
        operations.push({ name: op.name, ...measurement });
      }
      outcomes.push({ rows: size.rows, groups: size.groups, operations });
    }
    const small = outcomes[0];
    const large = outcomes[1];
    if (!small || !large) throw new Error("t075_missing_comparison_scales");
    const growth = small.operations.map((baseline) => {
      const increased = large.operations.find(
        (other) => other.name === baseline.name
      );
      if (!increased) throw new Error("t075_missing_comparison_action");
      // Floor protects machine timer quantization; diagnostic only.
      const medianRatio =
        increased.timing.medianMs / Math.max(baseline.timing.medianMs, 0.001);
      const comparedToLinear = medianRatio / (large.rows / small.rows);
      return {
        operation: baseline.name,
        medianGrowthFactor: medianRatio,
        growthVsLinearPerRow: comparedToLinear,
        possibleNonlinearWork: comparedToLinear > NONLINEAR_DIAGNOSTIC_FACTOR,
        diagnosticOnly: true,
      };
    });
    // Existing repo benchmark scripts emit captured stdout JSON. This is
    // test-local Jest output, never production logging or device telemetry.
    process.stdout.write(
      "T075_BENCHMARK_MACHINE_ONLY " +
        JSON.stringify({
          benchmark: "account-review-pure-v1",
          environment: {
            execution: "jest_node_machine_only",
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
            notDeviceEvidence: true,
          },
          sizes: SIZES,
          warmupIterations: WARMUP_ITERATIONS,
          measuredIterations: MEASURED_ITERATIONS,
          timings: outcomes,
          growthDiagnostics: growth,
          noWallClockPassFailThreshold: true,
        }) +
        "\n"
    );
  });
});
