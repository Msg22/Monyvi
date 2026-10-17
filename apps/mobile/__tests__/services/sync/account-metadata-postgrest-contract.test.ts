/**
 * #395: installed PostgREST mutation contract, not a fabricated query chain.
 * Existing fixture supplies real SQLite models/Add/foundation and current auth.
 * Its Supabase update fake is NEVER used here: each mutation uses the installed
 * PostgrestClient with a local fetch double. No network or hosted database.
 */
import {
  ledger,
  commitAdd,
  foundation,
  OWNER,
  FOREIGN,
  syncFixtureControls,
  serializeCanonicalJsonValue,
  type Account,
  type BankDetails,
  type AccountSmsSender,
} from "./account-create-default-sync-lifecycle-fixtures";
import type { SupabaseDatabase } from "@monyvi/db";
import type { PostgrestClient as PostgrestClientType } from "@supabase/postgrest-js";
import type { SupabaseWriteTable } from "@/services/sync/types";
import {
  ACCOUNT_METADATA_PATCH_ERROR,
  pushAccountMetadataPatch,
  pushAcceptedAccountChildMetadataPatch,
  type AcceptedAccountChildTable,
} from "@/services/sync/account-metadata-patch";
import { loadAccountActionProtection } from "@/services/sync/account-action-protection";
import {
  runWithAccountSyncAckExclusion,
  verifiedOwnedSyncRowCoverage,
  type AccountSyncAckCapability,
} from "@/services/sync/account-sync-ack-scope";
import { physicalSaveLedgerSnapshot } from "../account-review-save-sqlite-test-helpers";

const { PostgrestClient } = jest.requireActual<
  typeof import("@supabase/postgrest-js")
>("@supabase/postgrest-js");

type MetadataTable = "accounts" | AcceptedAccountChildTable;
const TABLES: readonly MetadataTable[] = [
  "accounts",
  "bank_details",
  "account_sms_senders",
];
const WRONG_ID = "77777777-7777-4777-8777-777777777777";
const REFUSALS = [
  "null count",
  "zero count",
  "multiple count",
  "wrong id",
  "null rows",
  "multiple rows",
  "foreign error",
] as const;
type ReplyMode = "one" | (typeof REFUSALS)[number];
interface CapturedRequest {
  readonly url: URL;
  readonly method: string | undefined;
  readonly prefer: readonly string[];
  readonly body: unknown;
}

function transport(
  id: string,
  mode: ReplyMode,
  beforeResponse?: () => Promise<void>
): {
  readonly client: PostgrestClientType<SupabaseDatabase>;
  readonly requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const localFetch: typeof fetch = async (input, init) => {
    // The installed client supplies a serialized URL/body. Never fall through
    // to global fetch, even if this expectation changes in a future version.
    if (typeof input !== "string" || typeof init?.body !== "string")
      throw new Error("unexpected_postgrest_fetch_shape");
    const url = new URL(input);
    if (url.origin !== "https://metadata-contract.invalid")
      throw new Error("unexpected_postgrest_origin");
    const headers = new Headers(init.headers);
    const prefer = (headers.get("Prefer") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const body: unknown = JSON.parse(init.body);
    requests.push({ url, method: init.method, prefer, body });
    let rows: ReadonlyArray<{ readonly id: string }> | null = [{ id }];
    if (mode === "wrong id") rows = [{ id: WRONG_ID }];
    if (mode === "null rows") rows = null;
    if (mode === "multiple rows") rows = [{ id }, { id: WRONG_ID }];
    if (mode === "zero count") rows = [];
    const total = mode === "multiple count" ? 2 : mode === "zero count" ? 0 : 1;
    const responseHeaders = new Headers({ "Content-Type": "application/json" });
    // A successful response must NOT manufacture count when the PATCH did
    // not request it. The real client additionally interprets this header.
    if (
      prefer.includes("count=exact") &&
      mode !== "null count" &&
      mode !== "foreign error"
    ) {
      responseHeaders.set(
        "Content-Range",
        total === 0 ? "*/0" : "0-0/" + total
      );
    }
    await beforeResponse?.();
    return new Response(
      JSON.stringify(
        mode === "foreign error"
          ? {
              code: "42501",
              details: null,
              hint: null,
              message: "permission denied for owner-scoped metadata update",
            }
          : prefer.includes("return=representation")
            ? rows
            : null
      ),
      {
        status: mode === "foreign error" ? 403 : 200,
        headers: responseHeaders,
      }
    );
  };
  const client = new PostgrestClient<SupabaseDatabase>(
    "https://metadata-contract.invalid/rest/v1",
    { fetch: localFetch, retry: false }
  );
  return { client, requests };
}

/** Narrow only input values for generated Update types; return the ACTUAL
 * installed builder, including eq/select/then. No simulated result or count. */
function installedTable(
  client: ReturnType<typeof transport>["client"],
  table: MetadataTable
): SupabaseWriteTable {
  const accounts = client.from("accounts");
  return {
    insert: () => Promise.reject(new Error("unexpected_metadata_insert")),
    upsert: () => Promise.reject(new Error("unexpected_metadata_upsert")),
    update: (
      values: Record<string, unknown>,
      options?: Parameters<typeof accounts.update>[1]
    ) => {
      if (table === "accounts") {
        if (
          Object.keys(values).join(",") !== "name" ||
          typeof values.name !== "string"
        )
          throw new Error("unexpected_account_metadata_values");
        return accounts.update({ name: values.name }, options);
      }
      if (table === "bank_details") {
        if (
          Object.keys(values).join(",") !== "account_number" ||
          typeof values.account_number !== "string"
        )
          throw new Error("unexpected_bank_metadata_values");
        return client
          .from("bank_details")
          .update({ account_number: values.account_number }, options);
      }
      if (
        Object.keys(values).sort().join(",") !==
          "normalized_sender_name,sender_name" ||
        typeof values.sender_name !== "string" ||
        typeof values.normalized_sender_name !== "string"
      )
        throw new Error("unexpected_sender_metadata_values");
      return client.from("account_sms_senders").update(
        {
          sender_name: values.sender_name,
          normalized_sender_name: values.normalized_sender_name,
        },
        options
      );
    },
  };
}

interface MetadataCase {
  readonly table: MetadataTable;
  readonly id: string;
  readonly accountId: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly expectedValues: Readonly<Record<string, string>>;
  readonly capability: AccountSyncAckCapability;
  readonly send: (remote: SupabaseWriteTable) => Promise<boolean>;
}
async function withMetadataCase(
  table: MetadataTable,
  runInAckScope: (context: MetadataCase) => Promise<void>
): Promise<void> {
  const database = ledger.database;
  // Real immutable Add and locally stored complete accepted receipt. This is
  // fixture authority, not a mocked protection catalog or handmade root model.
  const command = await commitAdd(
    database,
    "PostgREST metadata Bank",
    "0",
    false
  );
  const repository = foundation(database);
  await repository.markFinancialActionGroupSyncPending(
    command.envelope.actionId
  );
  await repository.recordFinancialActionGroupServerOutcome(
    command.envelope.actionId,
    "accepted",
    serializeCanonicalJsonValue({
      accountRevisions: [],
      actionId: command.envelope.actionId,
      effectiveEventId: null,
      holdingRevision: null,
      serverAcceptedAt: "2026-10-16T11:00:00.000Z",
      status: "accepted",
    }),
    null
  );
  await runWithAccountSyncAckExclusion(database, OWNER, async (capability) => {
    const protection = await loadAccountActionProtection({
      database,
      expectedOwnerId: OWNER,
      capability,
    });
    const account = await database
      .get<Account>("accounts")
      .find(command.accountId);
    let physical: Account | BankDetails | AccountSmsSender = account;
    let expectedValues: Readonly<Record<string, string>>;
    if (table === "accounts") {
      await database.write(() =>
        account.update((row) => {
          row.name = "Edited Bank";
        })
      );
      expectedValues = { name: "Edited Bank" };
    } else if (table === "bank_details") {
      if (!command.bankDetailId) throw new Error("real_add_bank_child_missing");
      const bank = await database
        .get<BankDetails>(table)
        .find(command.bankDetailId);
      await database.write(() =>
        bank.update((row) => {
          row.accountNumber = "00112233";
        })
      );
      physical = bank;
      expectedValues = { account_number: "00112233" };
    } else {
      const original = command.senders[0];
      if (!original) throw new Error("real_add_sender_missing");
      const sender = await database
        .get<AccountSmsSender>(table)
        .find(original.id);
      await database.write(() =>
        sender.update((row) => {
          row.senderName = "CIBALERT";
          row.normalizedSenderName = "cibalert";
        })
      );
      physical = sender;
      expectedValues = {
        sender_name: "CIBALERT",
        normalized_sender_name: "cibalert",
      };
    }
    const record = Object.fromEntries(Object.entries(physical._raw));
    const context: MetadataCase = {
      table,
      id: physical.id,
      accountId: command.accountId,
      record,
      expectedValues,
      capability,
      send: (remote) =>
        table === "accounts"
          ? pushAccountMetadataPatch({
              database,
              capability,
              expectedOwnerId: OWNER,
              record,
              protection,
              accountsTable: remote,
            })
          : pushAcceptedAccountChildMetadataPatch({
              database,
              capability,
              expectedOwnerId: OWNER,
              table,
              record,
              protection,
              remoteTable: remote,
            }),
    };
    try {
      await runInAckScope(context);
    } finally {
      syncFixtureControls.mockActiveOwner = OWNER;
    }
  });
}
function coverage(context: MetadataCase): ReadonlySet<string> {
  return verifiedOwnedSyncRowCoverage(
    context.capability,
    ledger.database,
    OWNER,
    context.table,
    context.record
  );
}
function assertRequest(
  context: MetadataCase,
  requests: readonly CapturedRequest[]
): void {
  expect(requests).toHaveLength(1);
  const request = requests[0];
  if (!request) throw new Error("actual_patch_request_missing");
  expect(request.method).toBe("PATCH");
  expect(request.url.pathname).toBe("/rest/v1/" + context.table);
  expect([...request.prefer].sort()).toEqual([
    "count=exact",
    "return=representation",
  ]);
  expect(request.url.searchParams.get("select")).toBe("id");
  expect(request.url.searchParams.get("id")).toBe("eq." + context.id);
  expect(
    request.url.searchParams.get(
      context.table === "accounts" ? "user_id" : "account_id"
    )
  ).toBe("eq." + (context.table === "accounts" ? OWNER : context.accountId));
  expect(request.body).toEqual(context.expectedValues);
}

describe("#395 actual installed PostgREST metadata PATCH contract", () => {
  it("does not invent an affected count when mutation UPDATE did not request it", async () => {
    const remote = transport(WRONG_ID, "one");
    const response = await remote.client
      .from("accounts")
      .update({ name: "No count request" })
      .eq("id", WRONG_ID)
      .select("id");
    expect(response.error).toBeNull();
    expect(response.data).toEqual([{ id: WRONG_ID }]);
    expect(response.count).toBeNull();
    expect(remote.requests[0]?.prefer).toEqual(["return=representation"]);
  });

  describe.each(TABLES)("%s", (table) => {
    it("requires PATCH count preference and returned ID before recording exact ACK coverage", async () => {
      await withMetadataCase(table, async (context) => {
        const before = await physicalSaveLedgerSnapshot(ledger.database);
        let writerAvailableDuringFetch = false;
        const remote = transport(context.id, "one", async () => {
          // If the production helper held its writer across fetch, this real
          // writer could not complete. No synthetic timeout or writer mock.
          await ledger.database.write(async () => {
            const row = await ledger.database.get(table).find(context.id);
            expect(Object.fromEntries(Object.entries(row._raw))).toEqual(
              context.record
            );
            writerAvailableDuringFetch = true;
          });
        });
        expect(coverage(context).size).toBe(0);
        await expect(
          context.send(installedTable(remote.client, table))
        ).resolves.toBe(true);
        assertRequest(context, remote.requests);
        expect(writerAvailableDuringFetch).toBe(true);
        const changed = context.record._changed;
        const expectedCovered = [
          ...Object.keys(context.expectedValues),
          // Watermelon couples an automatic timestamp only when it is dirty.
          ...(typeof changed === "string" &&
          changed.split(",").includes("updated_at")
            ? ["updated_at"]
            : []),
        ];
        expect([...coverage(context)].sort()).toEqual(expectedCovered.sort());
        expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(
          before
        );
      });
    });

    it.each(REFUSALS)(
      "refuses %s without recording any ACK coverage",
      async (mode) => {
        await withMetadataCase(table, async (context) => {
          const before = await physicalSaveLedgerSnapshot(ledger.database);
          const remote = transport(context.id, mode);
          await expect(
            context.send(installedTable(remote.client, table))
          ).rejects.toThrow(ACCOUNT_METADATA_PATCH_ERROR);
          assertRequest(context, remote.requests);
          expect(coverage(context).size).toBe(0);
          expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(
            before
          );
        });
      }
    );

    it("refuses a changed owner before dispatch", async () => {
      await withMetadataCase(table, async (context) => {
        const before = await physicalSaveLedgerSnapshot(ledger.database);
        const remote = transport(context.id, "one");
        syncFixtureControls.mockActiveOwner = FOREIGN;
        await expect(
          context.send(installedTable(remote.client, table))
        ).rejects.toThrow(ACCOUNT_METADATA_PATCH_ERROR);
        expect(remote.requests).toHaveLength(0);
        expect(coverage(context).size).toBe(0);
        expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(
          before
        );
      });
    });

    it("refuses a changed owner after a positive remote response", async () => {
      await withMetadataCase(table, async (context) => {
        const before = await physicalSaveLedgerSnapshot(ledger.database);
        const remote = transport(context.id, "one", () => {
          syncFixtureControls.mockActiveOwner = FOREIGN;
          return Promise.resolve();
        });
        await expect(
          context.send(installedTable(remote.client, table))
        ).rejects.toThrow(ACCOUNT_METADATA_PATCH_ERROR);
        assertRequest(context, remote.requests);
        expect(coverage(context).size).toBe(0);
        expect(await physicalSaveLedgerSnapshot(ledger.database)).toEqual(
          before
        );
      });
    });
  });
});
