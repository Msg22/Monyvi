/** #395 real Add private capture SQLite. Shared original Watermelon fixture. */
import {
  randomUUID,
  hashFinancialActionEnvelope,
  accountReviewLocalSaveSnapshotSchema,
  accountFormSchema,
  createAccountReviewFinancialRegistry,
  createFinancialActionFoundationRepository,
  cloneWatermelonRaw,
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  physicalSaveLedgerSnapshot,
  LEGACY_FINANCIAL_ACTION_TEST_REGISTRY,
  ADD_DEFAULT_IDS,
  ledger,
  OWNER,
  hashProvider,
  HASH,
  fail,
  form,
  service,
  seedPriorDefault,
  fresh,
  rootFor,
  create,
  privateFromActualRoot,
  assertCapturedPhysicalAdd,
  assertCaptureAuthorityRefusal,
  type Account,
  type FinancialActionGroup,
  type FinancialActionEnvelopeV1,
  type AccountFormData,
  type AccountDefaultPreparedCommand,
  type AccountType,
} from "./account-default-intent-local-capture-sqlite-fixture";
import SQLiteAdapter, {
  type SQLiteArg,
} from "@nozbe/watermelondb/adapters/sqlite";

/**
 * The installed 0.28 Node encoder passes native tuples only to the final
 * SqliteNodeDispatcher.call("batch"). Do not intercept a speculative Model
 * batch or invent a rejected Promise in place of SQLite's own constraint.
 */
type EncodedFinancialRootInsert = readonly [
  1,
  "financial_action_groups",
  string,
  ReadonlyArray<readonly SQLiteArg[]>,
];

function isSqliteArgument(value: unknown): value is SQLiteArg {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isEncodedFinancialRootInsert(
  value: unknown
): value is EncodedFinancialRootInsert {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const tuple: readonly unknown[] = value;
  if (
    tuple[0] !== 1 ||
    tuple[1] !== "financial_action_groups" ||
    typeof tuple[2] !== "string" ||
    !tuple[2].startsWith('insert into "financial_action_groups" (')
  )
    return false;
  const batches = tuple[3];
  if (!Array.isArray(batches) || batches.length !== 1) return false;
  const first: unknown = batches[0];
  return (
    Array.isArray(first) &&
    first.length > 3 &&
    typeof first[0] === "string" &&
    first.every(isSqliteArgument)
  );
}

describe("#395 T069 Add-only private writer capture (real SQLite)", () => {
  it.each<
    Readonly<{
      type: AccountType;
      opening: string;
      intent: boolean;
      prior: boolean;
    }>
  >([
    { type: "CASH", opening: "0", intent: false, prior: false },
    { type: "CASH", opening: "10.01", intent: true, prior: true },
    { type: "BANK", opening: "0", intent: true, prior: true },
    { type: "BANK", opening: "10.01", intent: false, prior: false },
    { type: "DIGITAL_WALLET", opening: "0", intent: false, prior: true },
    { type: "DIGITAL_WALLET", opening: "10.01", intent: true, prior: true },
  ])(
    "$type opening=$opening intent=$intent prior=$prior commits exactly one closed 12-key private image in the same real batch",
    async ({ type, opening, intent, prior }): Promise<void> => {
      if (prior) await seedPriorDefault();
      const priorRaw = prior
        ? cloneWatermelonRaw(
            (
              await ledger.database
                .get<Account>("accounts")
                .find(ADD_DEFAULT_IDS.previous)
            )._raw
          )
        : null;
      const command = await create(form(type, opening, intent));
      await assertCapturedPhysicalAdd({ command, priorRaw });
    }
  );

  it("seals actual unresolved predecessor roots/hashes and never resamples them on SQLite clone or original replay", async (): Promise<void> => {
    const svc = service();
    const first = await svc.prepare(OWNER, form("CASH", "0", false));
    await svc.commitPrepared(first);
    const firstRoot = await rootFor(await fresh(), first.envelope.actionId);
    const second = await svc.prepare(
      OWNER,
      form("DIGITAL_WALLET", "10.01", true)
    );
    expect(second.dependencyActionIds).toEqual([first.envelope.actionId]);
    await expect(svc.commitPrepared(second)).resolves.toMatchObject({
      kind: "committed",
      accountId: second.accountId,
    });
    const secondRoot = await rootFor(await fresh(), second.envelope.actionId);
    const original = privateFromActualRoot(secondRoot);
    expect(original.value.expectedDefaultSnapshot).toEqual({
      activeAccountIds: [first.accountId],
      defaultAccount: { accountId: first.accountId, isDefault: true },
    });
    expect(original.value.preparedDefaultSnapshot).toEqual({
      activeAccountIds: [first.accountId, second.accountId].sort(),
      defaultAccount: { accountId: second.accountId, isDefault: true },
    });
    expect(original.value.dependencyRoots).toEqual([
      {
        actionId: first.envelope.actionId,
        payloadHash: firstRoot.payloadHash,
      },
    ]);
    expect(firstRoot.payloadHash).toEqual(expect.stringMatching(HASH));
    const physicalBefore = await physicalSaveLedgerSnapshot(await fresh());
    expect((await svc.commitPrepared(second)).kind).toBe("replay");
    expect(await physicalSaveLedgerSnapshot(await fresh())).toEqual(
      physicalBefore
    );
    const after = await rootFor(await fresh(), second.envelope.actionId);
    expect(after.localRecoverySnapshotJson).toBe(original.raw);
    expect(after.payloadJson).toBe(secondRoot.payloadJson);
    expect(after.payloadHash).toBe(secondRoot.payloadHash);
  });

  it("a real mid-batch SQLite unique-index failure rolls back account/default/children/effect/root and permits same-command retry", async (): Promise<void> => {
    await seedPriorDefault();
    const svc = service();
    const command = await svc.prepare(OWNER, form("BANK", "10.01", true));
    const before = await physicalSaveLedgerSnapshot(await fresh());
    const prior = await ledger.database
      .get<Account>("accounts")
      .find(ADD_DEFAULT_IDS.previous);
    const cachedBefore = cloneWatermelonRaw(prior._raw);
    // The Watermelon Database.adapter is a Compat wrapper. Its *underlying*
    // SQLiteAdapter owns the final encoded dispatcher and Node bridge tag.
    const underlying = ledger.database.adapter.underlyingAdapter;
    if (!(underlying instanceof SQLiteAdapter)) {
      fail("expected_installed_sqlite_adapter");
    }
    const dispatcher = underlying._dispatcher;
    if (
      underlying._dispatcherType !== "asynchronous" ||
      dispatcher.constructor.name !== "SqliteNodeDispatcher"
    )
      fail("expected_actual_node_sqlite_dispatcher");
    const realDispatch = dispatcher.call.bind(dispatcher);
    let nativeBatchCalls = 0;
    let injectedCount = 0;
    let originalPhysicalRootId: string | null = null;
    const fault = jest
      .spyOn(dispatcher, "call")
      .mockImplementation((method, args, callback): void => {
        if (method !== "batch") {
          realDispatch(method, args, callback);
          return;
        }
        nativeBatchCalls += 1;
        const candidate: unknown = args[0];
        if (!Array.isArray(candidate)) {
          realDispatch(method, args, callback);
          return;
        }
        const encoded: readonly unknown[] = candidate;
        const nativeRoot = encoded.find(isEncodedFinancialRootInsert);
        if (!nativeRoot) {
          realDispatch(method, args, callback);
          return;
        }
        const originalArguments = nativeRoot[3][0];
        if (!originalArguments || typeof originalArguments[0] !== "string") {
          realDispatch(method, args, callback);
          return;
        }
        const columns =
          underlying.schema.tables.financial_action_groups.columnArray;
        const ownerPosition = columns.findIndex(
          (column) => column.name === "user_id"
        );
        const actionPosition = columns.findIndex(
          (column) => column.name === "action_id"
        );
        if (ownerPosition < 0 || actionPosition < 0) {
          realDispatch(method, args, callback);
          return;
        }
        // EncodeInsertArgs: [physicalId, _status, _changed, ...schemaColumns].
        // Confirm both parts of the REAL composite key from the native tuple.
        expect(originalArguments[ownerPosition + 3]).toBe(OWNER);
        expect(originalArguments[actionPosition + 3]).toBe(
          command.envelope.actionId
        );
        originalPhysicalRootId = originalArguments[0];
        expect(originalPhysicalRootId).not.toBe(command.envelope.actionId);

        const shadowPhysicalId = randomUUID();
        expect(shadowPhysicalId).not.toBe(originalPhysicalRootId);
        // The installed encodeBatch uses plain INSERT (NOT OR REPLACE).
        // Reuse its actual validated root SQL and every genuine argument,
        // changing ONLY physical id. The second owner/action pair hits the
        // actual financial_action_groups_user_action_unique index.
        const duplicateNativeInsert: readonly [
          0,
          null,
          string,
          ReadonlyArray<readonly SQLiteArg[]>,
        ] = [
          0,
          null,
          nativeRoot[2],
          [[shadowPhysicalId, ...originalArguments.slice(1)]],
        ];
        injectedCount += 1;
        realDispatch(method, [[...encoded, duplicateNativeInsert]], callback);
      });
    let rejected: unknown;
    let didReject = false;
    try {
      await svc.commitPrepared(command);
    } catch (error: unknown) {
      didReject = true;
      rejected = error;
    } finally {
      fault.mockRestore();
    }
    // Positive native injection MUST be established BEFORE interpreting a
    // thrown error. A setup/writer refusal before the dispatcher is NOT Red.
    expect(nativeBatchCalls).toBeGreaterThan(0);
    expect(injectedCount).toBe(1);
    expect(originalPhysicalRootId).not.toBeNull();
    expect(didReject).toBe(true);
    if (rejected === null) fail("native_unique_constraint_rejected_null");
    // better-sqlite3 errors may originate in a different Jest realm.
    // Validate the real native extended result, not instanceof Error.
    if (
      typeof rejected !== "object" ||
      rejected === null ||
      !("message" in rejected) ||
      typeof rejected.message !== "string" ||
      !("code" in rejected)
    )
      fail("native_unique_constraint_missing_message_or_code");
    expect(rejected.code).toBe("SQLITE_CONSTRAINT_UNIQUE");
    expect(rejected.message).toMatch(
      /UNIQUE constraint failed: financial_action_groups\.user_id, financial_action_groups\.action_id/
    );
    expect(await physicalSaveLedgerSnapshot(await fresh())).toEqual(before);
    expect(prior._raw).toEqual(cachedBefore);
    expect(prior.isDefault).toBe(true);
    expect(prior.financialRevision).toBe("5");
    await expect(
      (await fresh())
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).resolves.toHaveLength(0);
    await expect(
      ledger.database.get<Account>("accounts").find(command.accountId)
    ).rejects.toThrow();

    // Retry the SAME frozen command/service after releasing only the test
    // adapter fault. Real writer persistence, private evidence and replay
    // must succeed once; no synthetic service response or cache reset.
    await expect(svc.commitPrepared(command)).resolves.toEqual({
      kind: "committed",
      accountId: command.accountId,
    });
    const committed = await fresh();
    const saved = await rootFor(committed, command.envelope.actionId);
    expect(saved.localRecoverySnapshotJson).toEqual(expect.any(String));
    expect(
      (await committed.get<Account>("accounts").find(command.accountId)).deleted
    ).toBe(false);
    expect(
      (await committed.get<Account>("accounts").find(ADD_DEFAULT_IDS.previous))
        .isDefault
    ).toBe(false);
    const durable = await physicalSaveLedgerSnapshot(committed);
    await expect(svc.commitPrepared(command)).resolves.toEqual({
      kind: "replay",
      accountId: command.accountId,
    });
    expect(await physicalSaveLedgerSnapshot(await fresh())).toEqual(durable);
  });

  it("Review's original nine keys remain closed and actual legacy tuple roots keep a null private carrier", async (): Promise<void> => {
    expect(
      Object.keys(accountReviewLocalSaveSnapshotSchema.shape).sort()
    ).toEqual(
      [
        "version",
        "actionId",
        "ownerId",
        "sessionId",
        "smsDrafts",
        "createdEntityRefs",
        "defaultPreimages",
        "defaultDependencyActionIds",
        "queuePreimage",
      ].sort()
    );
    const envelope: FinancialActionEnvelopeV1 = {
      actionId: randomUUID(),
      domain: "metals",
      kind: "sell",
      domainReferenceId: randomUUID(),
      envelopeVersion: "monyvi.financial-action/v1",
      accountGuards: [],
      occurredAt: "2026-08-31T10:15:30.123Z",
      payloadVersion: "metals.sell/v1",
      userId: OWNER,
      payload: {
        feeMinorUnits: "80000",
        grossProceedsDecimal: "35500",
        holdingId: randomUUID(),
        includeAccountCredit: false,
        netProceedsMinorUnits: "3470000",
        notes: "Legacy",
        rateReferenceIds: [],
      },
    };
    const foundation = createFinancialActionFoundationRepository({
      database: ledger.database,
      getCurrentUserDataScope,
      assertExpectedCurrentUser,
      registry: LEGACY_FINANCIAL_ACTION_TEST_REGISTRY,
    });
    const result = await foundation.createFinancialActionGroup({
      envelope,
      hashProvider,
    });
    expect(result.kind).toBe("created");
    const root = await rootFor(await fresh(), envelope.actionId);
    expect(root.domain).toBe("metals");
    expect(root.payloadHash).toEqual(expect.stringMatching(HASH));
    expect(root.localRecoverySnapshotJson).toBeNull();
  });
});

describe("#395 T069 capture authority follow-up (real SQLite)", () => {
  it.each([
    "payload whitespace",
    "guard revision",
    "guard extra key",
    "guard duplicate key",
  ] as const)(
    "rejects %s without resealing a predecessor",
    async (damage): Promise<void> => {
      const svc = service();
      const first = await svc.prepare(OWNER, form("CASH", "10.01", false));
      await svc.commitPrepared(first);
      const predecessor = await rootFor(
        ledger.database,
        first.envelope.actionId
      );
      const sealed = await hashFinancialActionEnvelope(
        first.envelope,
        hashProvider,
        createAccountReviewFinancialRegistry()
      );
      const originalGuards = predecessor.accountGuardsJson;
      expect(predecessor.payloadJson).toBe(sealed.canonicalText);
      expect(predecessor.payloadHash).toBe(sealed.payloadHash);
      const second = await svc.prepare(OWNER, form("BANK", "10.01", true));
      expect(second.dependencyRoots).toEqual([
        {
          actionId: first.envelope.actionId,
          payloadHash: sealed.payloadHash,
        },
      ]);
      const guard = first.envelope.accountGuards[0];
      if (!guard) fail("missing_genuine_predecessor_guard");

      // Corrupt persisted proof only AFTER the real successor command was frozen.
      await ledger.database.write(async (): Promise<void> => {
        await predecessor.update((row) => {
          if (damage === "payload whitespace") {
            row.payloadJson = sealed.canonicalText + "\n";
          } else if (damage === "guard revision") {
            row.accountGuardsJson = JSON.stringify([
              { ...guard, expectedRevision: "1" },
            ]);
          } else if (damage === "guard extra key") {
            row.accountGuardsJson = JSON.stringify([
              { ...guard, unapproved: true },
            ]);
          } else {
            row.accountGuardsJson =
              '[{"accountId":' +
              JSON.stringify(guard.accountId) +
              ',"expectedRevision":"0","expectedRevision":"0"}]';
          }
        });
      });
      const parsed: unknown = JSON.parse(predecessor.payloadJson);
      expect(
        await hashFinancialActionEnvelope(
          parsed,
          hashProvider,
          createAccountReviewFinancialRegistry()
        )
      ).toEqual(sealed);
      expect(predecessor.payloadHash).toBe(sealed.payloadHash);
      const damagedRaw = cloneWatermelonRaw(predecessor._raw);
      const prior = await ledger.database
        .get<Account>("accounts")
        .find(first.accountId);
      await assertCaptureAuthorityRefusal(
        second,
        prior,
        damage === "payload whitespace"
          ? "account_default_creator_root_hash_mismatch"
          : "account_default_creator_root_identity_mismatch"
      );
      expect(predecessor._raw).toEqual(damagedRaw);

      // Restore only the deliberately damaged journal/bytes; do not resample B.
      await ledger.database.write(async (): Promise<void> => {
        await predecessor.update((row) => {
          row.payloadJson = sealed.canonicalText;
          row.accountGuardsJson = originalGuards;
        });
      });
      await expect(svc.commitPrepared(second)).resolves.toEqual({
        kind: "committed",
        accountId: second.accountId,
      });
      const capturedRoot = await rootFor(
        await fresh(),
        second.envelope.actionId
      );
      expect(privateFromActualRoot(capturedRoot).value.dependencyRoots).toEqual(
        second.dependencyRoots
      );
      expect(predecessor.payloadHash).toBe(sealed.payloadHash);
    }
  );

  it("accepts a closed equivalent guard journal without changing its captured hash", async (): Promise<void> => {
    const svc = service();
    const first = await svc.prepare(OWNER, form("CASH", "10.01", false));
    await svc.commitPrepared(first);
    const predecessor = await rootFor(ledger.database, first.envelope.actionId);
    const originalHash = predecessor.payloadHash;
    const second = await svc.prepare(OWNER, form("BANK", "10.01", true));
    await ledger.database.write(async (): Promise<void> => {
      await predecessor.update((row) => {
        row.accountGuardsJson = JSON.stringify(
          first.envelope.accountGuards.map((guard) => ({
            expectedRevision: guard.expectedRevision,
            accountId: guard.accountId,
          })),
          null,
          2
        );
      });
    });
    await expect(svc.commitPrepared(second)).resolves.toEqual({
      kind: "committed",
      accountId: second.accountId,
    });
    const captured = privateFromActualRoot(
      await rootFor(await fresh(), second.envelope.actionId)
    );
    expect(captured.value.dependencyRoots).toEqual([
      {
        actionId: first.envelope.actionId,
        payloadHash: originalHash,
      },
    ]);
    expect(predecessor.payloadHash).toBe(originalHash);
  });

  it.each([
    "account name",
    "account type",
    "institution",
    "provider",
    "bank number",
    "card last4",
    "sender name",
    "normalized sender",
  ] as const)(
    "rejects %s drift from the original public after-image",
    async (field): Promise<void> => {
      await seedPriorDefault();
      const svc = service();
      const original = await svc.prepare(
        OWNER,
        accountFormSchema.parse({
          ...form("BANK", "10.01", true),
          institutionId: null,
        })
      );
      const originalDigest = await hashFinancialActionEnvelope(
        original.envelope,
        hashProvider,
        createAccountReviewFinancialRegistry()
      );
      const override: Partial<AccountFormData> =
        field === "account name"
          ? { name: "Altered account name" }
          : field === "account type"
            ? { accountType: "DIGITAL_WALLET" }
            : field === "institution"
              ? { institutionId: "cib" }
              : field === "provider"
                ? { providerDisplayName: "Altered provider" }
                : field === "bank number"
                  ? { accountNumber: "1122334455" }
                  : field === "card last4"
                    ? { cardLast4: "9090" }
                    : {};
      const mismatched: AccountDefaultPreparedCommand = Object.freeze({
        ...original,
        form: Object.freeze(
          accountFormSchema.parse({ ...original.form, ...override })
        ),
        senders: Object.freeze(
          original.senders.map((sender) =>
            Object.freeze({
              ...sender,
              ...(field === "sender name"
                ? { senderName: "ALTERED-SENDER" }
                : {}),
              ...(field === "normalized sender"
                ? { normalizedSenderName: "altered-sender" }
                : {}),
            })
          )
        ),
      });
      expect(Object.isFrozen(original)).toBe(true);
      expect(mismatched.envelope).toBe(original.envelope);
      expect(
        await hashFinancialActionEnvelope(
          mismatched.envelope,
          hashProvider,
          createAccountReviewFinancialRegistry()
        )
      ).toEqual(originalDigest);
      expect(mismatched.accountId).toBe(original.accountId);
      expect(mismatched.bankDetailId).toBe(original.bankDetailId);
      expect(mismatched.senders.map((sender) => sender.id)).toEqual(
        original.senders.map((sender) => sender.id)
      );
      const prior = await ledger.database
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      const priorRaw = cloneWatermelonRaw(prior._raw);
      await assertCaptureAuthorityRefusal(mismatched, prior);

      // The genuine command still succeeds after refusal, proving cache recovery.
      await expect(svc.commitPrepared(original)).resolves.toEqual({
        kind: "committed",
        accountId: original.accountId,
      });
      await assertCapturedPhysicalAdd({ command: original, priorRaw });
    }
  );
});
