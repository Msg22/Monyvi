/**
 * #395 dedicated root pull — date-bearing Metals envelopes remain registered.
 * Exercises the REAL checkedCloudActionRoot/registry and immutable SHA-256.
 * Only the native Expo hash primitive is mapped to Node in Jest.
 */
import { createHash } from "node:crypto";
import {
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import { createAccountDefaultAndReviewRegistry } from "../../../../packages/logic/src/financial-actions/account-create-default-registration";
import { calendarDateForTimestamp } from "../../../../packages/logic/src/metals/historical-rate";
import { createMetalFinancialActionEnvelope } from "../../services/metal-financial-action-adapter";
import { checkedCloudActionRoot } from "../../services/sync/financial-action-root-pull-identity";
import {
  ADD_ACTION_ID,
  SELL_ACTION_ID,
  SOLD_HOLDING_ID,
  USER_ID,
  soldGroup,
  soldPayload,
} from "./metal-portfolio-realized-sale-fixtures";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (algorithm: string, value: string): Promise<string> => {
    if (algorithm !== "SHA-256")
      return Promise.reject(new Error("unexpected_hash_algorithm"));
    const crypto =
      jest.requireActual<typeof import("node:crypto")>("node:crypto");
    return Promise.resolve(
      crypto.createHash("sha256").update(value, "utf8").digest("hex")
    );
  },
}));

const FROZEN_UTC = "2026-10-18T21:30:00.000Z";
const CAIRO_DAY = "2026-10-19";
const FUTURE_CAIRO_DAY = "2026-10-20";
const DIFFERENT_OWNER = "018f0c7a-1234-7abc-8def-000000000999";
const ADD_ROOT_ID = "018f0c7a-1234-7abc-8def-000000000125";
const SELL_ROOT_ID = "018f0c7a-1234-7abc-8def-000000000126";
const registry = createAccountDefaultAndReviewRegistry();
const validationInput = { latestAllowedCalendarDate: CAIRO_DAY };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Creation-side approved Add validator, including its business-day context. */
function validAddText(): string {
  const envelope = createMetalFinancialActionEnvelope({
    actionId: ADD_ACTION_ID,
    userId: USER_ID,
    holdingId: SOLD_HOLDING_ID,
    kind: "add",
    expectedHoldingRevision: null,
    occurredAt: "2026-08-20T10:00:00.000Z",
    validationInput,
    domainPayload: {
      expectedHoldingRevision: null,
      holdingId: SOLD_HOLDING_ID,
      materialFacts: {
        physicalForm: "COIN",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-08-20",
        purchasePriceDecimal: "30000",
        purityCatalogVersion: "1",
        purityCode: "gold-9999",
        purityFactorDecimal: "0.9999",
        weightGramsDecimal: "15",
      },
      metalType: "GOLD",
      metadata: { name: "QA Sold Gold Coin", notes: null },
      predecessorEventId: null,
      rateSnapshots: [],
      reversesEventId: null,
    },
  });
  return serializeFinancialActionEnvelope(envelope, registry, validationInput);
}

/** Existing whole-holding Sell fixture; production registry, not a mock. */
function validSellText(): string {
  const fixture = soldGroup(soldPayload());
  const envelope = parseFinancialActionEnvelopeJson(
    fixture.payloadJson,
    registry,
    validationInput
  );
  return serializeFinancialActionEnvelope(envelope, registry, validationInput);
}

/** Complete public financial_action_groups row with the real immutable hash. */
function cloudRow(
  text: string,
  rootId: string
): Readonly<Record<string, unknown>> {
  const envelope = parseFinancialActionEnvelopeJson(
    text,
    registry,
    validationInput
  );
  const when = Date.parse(envelope.occurredAt);
  return {
    id: rootId,
    account_guards_json: JSON.stringify(envelope.accountGuards),
    action_id: envelope.actionId,
    created_at: when,
    deleted: false,
    domain: envelope.domain,
    domain_reference_id: envelope.domainReferenceId,
    kind: envelope.kind,
    outcome_json: null,
    payload_hash: sha256(text),
    payload_json: text,
    rejection_code: null,
    server_outcome: null,
    state: "local_complete",
    updated_at: when,
    user_id: envelope.userId,
  };
}

beforeEach((): void => {
  jest.useFakeTimers();
  // UTC is still October 18, but the trusted Africa/Cairo calendar is Oct 19.
  jest.setSystemTime(new Date(FROZEN_UTC));
});

afterEach((): void => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("#395 Metals action root pull Cairo-date context", () => {
  it.each([
    ["Add", validAddText, ADD_ACTION_ID, ADD_ROOT_ID],
    ["Sell", validSellText, SELL_ACTION_ID, SELL_ROOT_ID],
  ] as const)(
    "accepts a valid registered %s cloud root without changing bytes, owner or SHA-256",
    async (_kind, getText, actionId, rootId): Promise<void> => {
      expect(calendarDateForTimestamp(Date.now())).toBe(CAIRO_DAY);
      expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-18");
      const rawText = getText();
      const incoming = cloudRow(rawText, rootId);
      // The exact same historically valid envelope cannot be revalidated
      // without its date context; no new schema or payload interpretation.
      expect(() => parseFinancialActionEnvelopeJson(rawText, registry)).toThrow(
        "financial_action_invalid_payload"
      );
      const checked = await checkedCloudActionRoot(incoming, USER_ID);
      expect(checked).toMatchObject({
        actionId,
        id: rootId,
        ownerId: USER_ID,
        payloadHash: sha256(rawText),
        payloadJson: rawText,
        state: "local_complete",
        isDeleted: false,
        verifiedReviewAcceptance: false,
      });
      expect(checked.canonical.payload_json).toBe(rawText);
      expect(checked.canonical.payload_hash).toBe(sha256(rawText));
      expect(checked.canonical.account_guards_json).toBe("[]");
    }
  );

  it.each([
    ["Add", validAddText, ADD_ROOT_ID, "purchaseDate", "2026-08-20"],
    ["Sell", validSellText, SELL_ROOT_ID, "saleDate", "2026-08-22"],
  ] as const)(
    "refuses a future %s date even when the changed payload has a matching SHA-256",
    async (_kind, getText, rootId, field, originalDate): Promise<void> => {
      const original = getText();
      const dated = JSON.stringify(field) + ":" + JSON.stringify(originalDate);
      const future =
        JSON.stringify(field) + ":" + JSON.stringify(FUTURE_CAIRO_DAY);
      expect(original.split(dated)).toHaveLength(2);
      const altered = original.replace(dated, future);
      const incoming = cloudRow(original, rootId);
      expect(sha256(altered)).not.toBe(incoming.payload_hash);
      const futureHashBound = {
        ...incoming,
        payload_json: altered,
        payload_hash: sha256(altered),
      };
      await expect(
        checkedCloudActionRoot(futureHashBound, USER_ID)
      ).rejects.toThrow("financial_action_invalid_payload");
    }
  );

  it("refuses foreign owners and valid-date payload edits with stale hashes", async (): Promise<void> => {
    const original = validSellText();
    const incoming = cloudRow(original, SELL_ROOT_ID);
    await expect(
      checkedCloudActionRoot(incoming, DIFFERENT_OWNER)
    ).rejects.toThrow("financial_action_root_pull_foreign_owner");

    const originalDate = '"saleDate":"2026-08-22"';
    expect(original.split(originalDate)).toHaveLength(2);
    const edited = original.replace(originalDate, '"saleDate":"2026-08-21"');
    // A revised payload that is otherwise calendar-valid must still fail
    // immutable hash binding, never be silently normalized/accepted.
    await expect(
      checkedCloudActionRoot({ ...incoming, payload_json: edited }, USER_ID)
    ).rejects.toThrow("financial_action_root_pull_payload_hash_mismatch");
    await expect(
      checkedCloudActionRoot(
        { ...incoming, payload_hash: "0".repeat(64) },
        USER_ID
      )
    ).rejects.toThrow("financial_action_root_pull_payload_hash_mismatch");
  });

  it("fails closed if a trusted Cairo calendar date cannot be derived", async (): Promise<void> => {
    const incoming = cloudRow(validSellText(), SELL_ROOT_ID);
    jest.spyOn(Date, "now").mockReturnValue(Number.NaN);
    await expect(checkedCloudActionRoot(incoming, USER_ID)).rejects.toThrow(
      "financial_action_root_pull_calendar_date_unavailable"
    );
  });
});
