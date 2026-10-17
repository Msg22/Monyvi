/** Exact preexisting SMS transport wire/privacy tests, with transport dependencies injected. */
interface SmsTransportFixture {
  readonly mockSynchronize: jest.Mock;
  readonly mockFrom: jest.Mock;
  readonly mockUpsert: jest.Mock;
  readonly runSync: () => Promise<void>;
}
export function registerSmsProvenanceSyncCases({
  mockSynchronize,
  mockFrom,
  mockUpsert,
  runSync,
}: SmsTransportFixture): void {
  it("pushes SMS-created transactions with sms_fingerprint and without the old sms_body_hash field", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            transactions: {
              created: [
                {
                  id: "transaction-1",
                  user_id: "current-user",
                  amount: 850,
                  type: "EXPENSE",
                  date: Date.UTC(2026, 0, 15),
                  created_at: Date.UTC(2026, 0, 15, 10),
                  updated_at: Date.UTC(2026, 0, 15, 10),
                  sms_fingerprint: "sms-fingerprint-transaction-1",
                  sms_body_hash: "legacy-hash-should-not-sync",
                },
              ],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(runSync()).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "transaction-1",
          user_id: "current-user",
          sms_fingerprint: "sms-fingerprint-transaction-1",
          date: "2026-01-15",
          created_at: "2026-01-15T10:00:00.000Z",
          updated_at: "2026-01-15T10:00:00.000Z",
        }),
      ],
      { onConflict: "id" }
    );

    const insertCalls: ReadonlyArray<
      readonly [ReadonlyArray<Record<string, unknown>>, { onConflict: "id" }]
    > = mockUpsert.mock.calls;
    const [insertedRows] = insertCalls[0];
    const [insertedRow] = insertedRows;
    expect(insertedRow).not.toHaveProperty("sms_body_hash");
  });

  it("pushes SMS-created transfers with sms_fingerprint and without the old sms_body_hash field", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            transfers: {
              created: [
                {
                  id: "transfer-1",
                  user_id: "current-user",
                  from_account_id: "cash-account",
                  to_account_id: "bank-account",
                  amount: 1000,
                  date: Date.UTC(2026, 0, 16),
                  created_at: Date.UTC(2026, 0, 16, 12),
                  updated_at: Date.UTC(2026, 0, 16, 12),
                  sms_fingerprint: "sms-fingerprint-transfer-1",
                  sms_body_hash: "legacy-transfer-hash-should-not-sync",
                },
              ],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(runSync()).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("transfers");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "transfer-1",
          user_id: "current-user",
          sms_fingerprint: "sms-fingerprint-transfer-1",
          date: "2026-01-16",
          created_at: "2026-01-16T12:00:00.000Z",
          updated_at: "2026-01-16T12:00:00.000Z",
        }),
      ],
      { onConflict: "id" }
    );

    const insertCalls: ReadonlyArray<
      readonly [ReadonlyArray<Record<string, unknown>>, { onConflict: "id" }]
    > = mockUpsert.mock.calls;
    const [insertedRows] = insertCalls[0];
    const [insertedRow] = insertedRows;
    expect(insertedRow).not.toHaveProperty("sms_body_hash");
  });
}
