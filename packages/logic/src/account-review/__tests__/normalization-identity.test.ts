/**
 * #395 T014-P identity and multiplicity contract; pure first-session projections.
 * Model response aliases are not persisted transaction or group identities.
 */
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../schemas";
import { deriveAccountReviewGroupIdentity } from "../identity";
import { normalizeAccountReviewParserResult } from "../normalization";
import {
  NORMALIZATION_IDS,
  makeVoiceInput,
  makeTwoIdenticalVoiceInput,
  makeTwoIdenticalVoiceWithExtraInput,
  syntheticHashProvider,
} from "./normalization-fixtures";

async function canonical(
  input: Parameters<typeof normalizeAccountReviewParserResult>[0]
): Promise<AccountReviewSession> {
  const projected = await normalizeAccountReviewParserResult(input);
  return accountReviewSessionSchema.parse(projected);
}

describe("#395 T014-P — stable row occurrence and pending-group identities", () => {
  it("keeps two identical, explicitly spoken Voice expenses as distinct unselected rows", async () => {
    const session = await canonical(makeTwoIdenticalVoiceInput());
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(2);
    expect(new Set(session.rows.map((row) => row.rowId)).size).toBe(2);
    expect(session.rows.map((row) => row.amountDecimal)).toEqual(["50", "50"]);
    expect(session.rows.map((row) => row.transaction.categoryId)).toEqual([
      NORMALIZATION_IDS.foodCategory,
      NORMALIZATION_IDS.foodCategory,
    ]);
    expect(session.rows.every((row) => row.sourceFingerprint === null)).toBe(
      true
    );
    expect(session.rows.every((row) => !row.selected)).toBe(true);
    expect(session.groups).toHaveLength(1);
    const group = session.groups[0];
    if (!group) throw new Error("Missing shared Voice account group");
    expect(group.status).toBe("pending");
    expect([...group.linkedRowIds].sort()).toEqual(
      session.rows.map((row) => row.rowId).sort()
    );
    for (const row of session.rows) {
      expect(row.assignment).toMatchObject({
        state: "suggested",
        groupId: group.groupId,
        confirmation: "pending",
      });
    }
  });

  it("keeps the duplicate Voice row-ID set across reordered retry aliases and partial chunks", async () => {
    const input = makeTwoIdenticalVoiceInput();
    const initial = await canonical(input);
    const alternateRef = "retry-suggested-qnb";
    const retryRows = input.providerResponse.transactions.map((row, index) => ({
      ...row,
      transactionRef: index === 0 ? "retry-b" : "retry-a",
      suggestionRef: alternateRef,
    }));
    const retry = await canonical({
      ...input,
      financialRows: [...retryRows].reverse(),
      mappedTransactions: [...input.mappedTransactions].reverse(),
      providerResponse: {
        ...input.providerResponse,
        transactions: [...retryRows].reverse(),
        suggestedAccounts: input.providerResponse.suggestedAccounts.map(
          (group) => ({
            ...group,
            suggestionRef: alternateRef,
            transactionRefs: retryRows.map((row) => row.transactionRef),
          })
        ),
      },
    });
    expect(retry.rows.map((row) => row.rowId).sort()).toEqual(
      initial.rows.map((row) => row.rowId).sort()
    );
    expect(retry.groups[0]?.evidenceKey).toBe(initial.groups[0]?.evidenceKey);
    expect(retry.groups[0]?.groupId).toBe(initial.groups[0]?.groupId);

    const first = input.providerResponse.transactions[0];
    const firstMapped = input.mappedTransactions[0];
    const group = input.providerResponse.suggestedAccounts[0];
    if (!first || !firstMapped || !group)
      throw new Error("Missing partial fixture");
    const partial = await canonical({
      ...input,
      financialRows: [first],
      mappedTransactions: [firstMapped],
      providerResponse: {
        ...input.providerResponse,
        transactions: [first],
        suggestedAccounts: [
          { ...group, transactionRefs: [first.transactionRef] },
        ],
      },
    });
    expect(initial.rows.map((row) => row.rowId)).toContain(
      partial.rows[0]?.rowId
    );
    expect(partial.groups[0]?.groupId).toBe(initial.groups[0]?.groupId);
  });

  it("preserves duplicate occurrence IDs when a distinct later Voice entry joins", async () => {
    const initial = await canonical(makeTwoIdenticalVoiceInput());
    const extended = await canonical(makeTwoIdenticalVoiceWithExtraInput());
    expect(extended.rows).toHaveLength(3);
    expect(
      extended.rows.filter((row) => row.amountDecimal === "50")
    ).toHaveLength(2);
    expect(
      extended.rows.filter((row) => row.amountDecimal === "25")
    ).toHaveLength(1);
    expect(
      extended.rows
        .filter((row) => row.amountDecimal === "50")
        .map((row) => row.rowId)
        .sort()
    ).toEqual(initial.rows.map((row) => row.rowId).sort());
    expect(extended.groups).toHaveLength(1);
    expect(extended.groups[0]?.evidenceKey).toBe(
      initial.groups[0]?.evidenceKey
    );
    expect(extended.groups[0]?.linkedRowIds).toHaveLength(3);
  });

  it("distinguishes another logical Voice recording without changing account group identity", async () => {
    const input = makeTwoIdenticalVoiceInput();
    const first = await canonical(input);
    const logicalRequestKey = "voice-logical-request-2";
    const transactions = input.providerResponse.transactions.map((row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
          ...span,
          sourceRef: logicalRequestKey,
        })),
      },
      currencyEvidence: {
        ...row.currencyEvidence,
        evidenceSpans: row.currencyEvidence.evidenceSpans.map((span) => ({
          ...span,
          sourceRef: logicalRequestKey,
        })),
      },
    }));
    const second = await canonical({
      ...input,
      requestKey: logicalRequestKey,
      financialRows: transactions,
      providerResponse: { ...input.providerResponse, transactions },
    });
    expect(second.rows).toHaveLength(2);
    expect(
      second.rows.every(
        (row) => !first.rows.some((original) => original.rowId === row.rowId)
      )
    ).toBe(true);
    expect(second.groups[0]?.evidenceKey).toBe(first.groups[0]?.evidenceKey);
  });

  it("uses the frozen ordered v1 group preimage and deterministic UUIDv8 projection", async () => {
    const group = (await canonical(makeVoiceInput())).groups[0];
    if (!group) throw new Error("Missing canonical group");
    const preimage = JSON.stringify([
      "monyvi.account-review.group-identity",
      "v1",
      NORMALIZATION_IDS.owner,
      NORMALIZATION_IDS.session,
      "VOICE",
      "qnb",
      "BANK",
      "EGP",
      null,
      "qnb",
      null,
      ["qnb"],
    ]);
    const digest = await syntheticHashProvider.digestUtf8(preimage);
    expect(group.evidenceKey).toBe(digest);
    const bytes = digest.slice(0, 32).split("");
    bytes[12] = "8";
    bytes[16] = ((parseInt(bytes[16] ?? "0", 16) % 4) + 8).toString(16);
    const hex = bytes.join("");
    expect(group.groupId).toBe(
      [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
      ].join("-")
    );
  });

  it("canonicalizes grounded group-name and sender-alias case/whitespace", async () => {
    const input = makeVoiceInput();
    const base = await canonical(input);
    const suggestion = input.providerResponse.suggestedAccounts[0];
    if (!suggestion) throw new Error("Missing synthetic suggested account");
    const variant = await canonical({
      ...input,
      providerResponse: {
        ...input.providerResponse,
        suggestedAccounts: [
          {
            ...suggestion,
            name: "  QnB  ",
            providerDisplayName: suggestion.providerDisplayName,
            senderNames: ["  QNB  "],
          },
        ],
      },
    });
    expect(variant.groups).toHaveLength(1);
    expect(variant.groups[0]?.evidenceKey).toBe(base.groups[0]?.evidenceKey);
    expect(variant.groups[0]?.groupId).toBe(base.groups[0]?.groupId);
  });

  it("reuses the exact typed group helper while rejecting malformed SHA and distinct cards", async () => {
    const input = makeVoiceInput();
    const group = (await canonical(input)).groups[0];
    if (!group) throw new Error("Missing initial group");
    const identity = {
      name: group.name,
      type: group.type,
      currency: group.currency,
      institutionId: group.institutionId,
      providerDisplayName: group.providerDisplayName,
      cardLast4: group.cardLast4,
      senderNames: group.senderNames,
    };
    const scope = {
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      source: input.source,
    };
    const original = await deriveAccountReviewGroupIdentity({
      ...scope,
      identity,
      hashProvider: syntheticHashProvider,
    });
    expect(original).toEqual({
      evidenceKey: group.evidenceKey,
      groupId: group.groupId,
    });
    const card = await deriveAccountReviewGroupIdentity({
      ...scope,
      identity: { ...identity, cardLast4: "0007" },
      hashProvider: syntheticHashProvider,
    });
    expect(card.groupId).not.toBe(original.groupId);
    await expect(
      deriveAccountReviewGroupIdentity({
        ...scope,
        identity,
        hashProvider: {
          digestUtf8: (): Promise<string> => Promise.resolve("bad"),
        },
      })
    ).rejects.toThrow();
  });
});
