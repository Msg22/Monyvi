/** #395 real Add private capture SQLite. Shared original Watermelon fixture. */
import {
  Q,
  hashFinancialActionEnvelope,
  validateAccountCreateDefaultPayload,
  accountFormSchema,
  createAccountReviewFinancialRegistry,
  physicalRawField,
  cloneWatermelonRaw,
  ADD_DEFAULT_IDS,
  ledger,
  OWNER,
  hashProvider,
  fail,
  record,
  form,
  service,
  seedPriorDefault,
  fresh,
  rootFor,
  assertCapturedPhysicalAdd,
  assertCaptureAuthorityRefusal,
  type Account,
  type BankDetails,
  type AccountDefaultPreparedCommand,
} from "./account-default-intent-local-capture-sqlite-fixture";

describe("#395 T069 C2-1 BankDetails public-to-physical card authority (real SQLite)", () => {
  it("accepts validated public 0042 as physical card_last_4 number 42, preserving its original public bytes and captured physical child hash", async (): Promise<void> => {
    const svc = service();
    const command = await svc.prepare(OWNER, form("BANK", "10.01", false));
    const publicPayload = validateAccountCreateDefaultPayload(
      command.envelope.payload
    );
    const originalPublic = await hashFinancialActionEnvelope(
      command.envelope,
      hashProvider,
      createAccountReviewFinancialRegistry()
    );
    const bankMutation = publicPayload.domainMutation.records.find(
      (mutation) =>
        mutation.entity === "bank_details" && mutation.mode === "create"
    );
    if (
      !bankMutation ||
      bankMutation.entity !== "bank_details" ||
      bankMutation.mode !== "create"
    )
      fail("missing_public_bank_mutation");
    expect(command.form.cardLast4).toBe("0042");
    expect(bankMutation.after.cardLast4).toBe("0042");
    expect(bankMutation.after.accountNumber).toBe("0088997766");
    expect(Object.isFrozen(command.envelope)).toBe(true);

    await expect(svc.commitPrepared(command)).resolves.toEqual({
      kind: "committed",
      accountId: command.accountId,
    });
    const db = await fresh();
    const bank = await db
      .get<BankDetails>("bank_details")
      .query(Q.where("account_id", command.accountId))
      .fetch();
    expect(bank).toHaveLength(1);
    expect(bank[0]?.id).toBe(command.bankDetailId);
    expect(bank[0]?.cardLast4).toBe(42);
    expect(
      bank.map((row) => physicalRawField(row._raw, "card_last_4"))
    ).toEqual([42]);
    expect(
      bank.map((row) =>
        Object.prototype.hasOwnProperty.call(row._raw, "card_last4")
      )
    ).toEqual([false]);
    const root = await rootFor(db, command.envelope.actionId);
    expect(root.payloadJson).toBe(originalPublic.canonicalText);
    expect(root.payloadHash).toBe(originalPublic.payloadHash);
    const parsedPublic: unknown = JSON.parse(root.payloadJson);
    const persistedEnvelope = record(
      parsedPublic,
      "invalid_root_public_envelope"
    );
    expect(
      validateAccountCreateDefaultPayload(
        persistedEnvelope.payload
      ).domainMutation.records.find(
        (mutation) =>
          mutation.entity === "bank_details" && mutation.mode === "create"
      )
    ).toEqual(bankMutation);
    await assertCapturedPhysicalAdd({ command, priorRaw: null });
  });

  it("accepts absent optional public cardLast4 as physical null, not a fabricated number or missing column", async (): Promise<void> => {
    const formWithoutCard = accountFormSchema.parse({
      ...form("BANK", "0", false),
      cardLast4: "",
    });
    const svc = service();
    const command = await svc.prepare(OWNER, formWithoutCard);
    const publicPayload = validateAccountCreateDefaultPayload(
      command.envelope.payload
    );
    const bankMutation = publicPayload.domainMutation.records.find(
      (mutation) =>
        mutation.entity === "bank_details" && mutation.mode === "create"
    );
    if (
      !bankMutation ||
      bankMutation.entity !== "bank_details" ||
      bankMutation.mode !== "create"
    )
      fail("missing_optional_bank_mutation");
    expect(command.form.cardLast4).toBe("");
    expect(bankMutation.after.cardLast4).toBeNull();

    await expect(svc.commitPrepared(command)).resolves.toEqual({
      kind: "committed",
      accountId: command.accountId,
    });
    const bank = await (await fresh())
      .get<BankDetails>("bank_details")
      .query(Q.where("account_id", command.accountId))
      .fetch();
    expect(bank).toHaveLength(1);
    expect(
      bank.map((row) => physicalRawField(row._raw, "card_last_4"))
    ).toEqual([null]);
    await assertCapturedPhysicalAdd({ command, priorRaw: null });
  });

  it("refuses a changed but valid leading-zero public/form card value and still admits the original frozen Bank command", async (): Promise<void> => {
    await seedPriorDefault();
    const svc = service();
    const original = await svc.prepare(OWNER, form("BANK", "10.01", true));
    const publicDigest = await hashFinancialActionEnvelope(
      original.envelope,
      hashProvider,
      createAccountReviewFinancialRegistry()
    );
    const mismatched: AccountDefaultPreparedCommand = Object.freeze({
      ...original,
      form: Object.freeze(
        accountFormSchema.parse({
          ...original.form,
          cardLast4: "0043",
        })
      ),
    });
    expect(original.form.cardLast4).toBe("0042");
    expect(mismatched.form.cardLast4).toBe("0043");
    expect(mismatched.envelope).toBe(original.envelope);
    expect(
      await hashFinancialActionEnvelope(
        mismatched.envelope,
        hashProvider,
        createAccountReviewFinancialRegistry()
      )
    ).toEqual(publicDigest);
    const prior = await ledger.database
      .get<Account>("accounts")
      .find(ADD_DEFAULT_IDS.previous);
    const priorRaw = cloneWatermelonRaw(prior._raw);
    await assertCaptureAuthorityRefusal(mismatched, prior);
    await expect(svc.commitPrepared(original)).resolves.toEqual({
      kind: "committed",
      accountId: original.accountId,
    });
    const bank = await (await fresh())
      .get<BankDetails>("bank_details")
      .query(Q.where("account_id", original.accountId))
      .fetch();
    expect(bank).toHaveLength(1);
    expect(
      bank.map((row) => physicalRawField(row._raw, "card_last_4"))
    ).toEqual([42]);
    await assertCapturedPhysicalAdd({ command: original, priorRaw });
  });
});
