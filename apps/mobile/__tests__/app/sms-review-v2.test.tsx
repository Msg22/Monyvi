/** #395 T054: real SMS route and canonical hook, mocked owned storage/financial transport only. */
import { act, render, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  useAccountReview, type UseAccountReviewInput,
  type UseAccountReviewResult,
} from "../../hooks/useAccountReview";
import type { ReviewSaveInput } from
  "../../services/account-review-save-preparation";
import { freezeSelectedAccountReview } from
  "../../services/account-review-save-preparation";
import type { AccountReviewSaveResult } from
  "../../services/account-review-save-service";
import type { LoadOrBootstrapSmsReviewInput } from
  "../../services/account-review-legacy-bootstrap-service";
import type { AccountReviewAccountSnapshots } from
  "../../services/account-review-read-model-service";
import type { RevalidatedSmsReviewDraftItem } from
  "../../services/sms-review-draft-reference-service";
import { makeOwnedContext } from
  "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeSaveFixture, OWNER, FOREIGN_OWNER, SESSION, testUuid,
  type SaveFixture,
} from "../services/account-review-save-test-fixtures";

interface V2SmsBoundary {
  readonly input: UseAccountReviewInput;
  readonly onSaveSelected: (session: AccountReviewSession) => Promise<void>;
}
interface ReviewProps {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly onSave: (
    selected: readonly ParsedSmsTransaction[],
    accounts: ReadonlyMap<number, string>,
    destinations: ReadonlyMap<number, string>
  ) => Promise<void>;
  readonly onReviewLater?: () => void;
  readonly onDiscard: () => void;
  readonly isSaving: boolean;
  /** Proposed additive V2-only typed facade; V1 props remain intact. */
  readonly accountReview?: V2SmsBoundary;
}
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockClear = jest.fn();
const mockMarkComplete = jest.fn<Promise<void>, []>();
const mockLegacySave = jest.fn();
const mockDiscardAll = jest.fn();
const mockReview = jest.fn<void, [ReviewProps]>();
const mockSave = jest.fn<Promise<AccountReviewSaveResult>, [ReviewSaveInput]>();
const mockBootstrap = jest.fn<
  Promise<AccountReviewSession>, [LoadOrBootstrapSmsReviewInput]
>();
const mockOwnedRead = jest.fn<Promise<AccountReviewAccountSnapshots>, []>();
const mockSmsCommand = jest.fn();

let mockActor: string | null = OWNER;
let mockQueueId: string | null = SESSION;
let mockSession: AccountReviewSession = makeSaveFixture("sms-new-bank").session;
let mockItems: readonly RevalidatedSmsReviewDraftItem[] = [];

function queueItems(fixture: SaveFixture): readonly RevalidatedSmsReviewDraftItem[] {
  return fixture.session.rows.flatMap((row, position) => {
    if (row.source !== "SMS") return [];
    return [{
      draftId: testUuid(800 + position),
      queueId: fixture.session.sessionId,
      transaction: row.transaction,
      selectionOverride: row.selected,
      position,
      parsedAt: new Date("2026-10-15T12:00:00.000Z"),
      updatedAt: new Date("2026-10-15T12:00:00.000Z"),
      hardValidationReasons: [],
    }];
  });
}

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace, back: mockBack, push: mockPush,
  }),
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: mockActor, isResolvingUser: false }),
}));
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => Promise.resolve(mockActor),
}));
jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    unresolvedCandidates: [],
    safeguardSummary: null,
    parserDiagnostics: null,
    clearTransactions: mockClear,
  }),
}));
jest.mock("@/hooks/useSmsReviewDraftQueue", () => ({
  useSmsReviewDraftQueue: () => ({
    userId: mockActor, queueId: mockQueueId,
    items: mockItems, itemCount: mockItems.length,
    isLoading: false, error: null,
    refetch: (): Promise<void> => Promise.resolve(),
  }),
}));
jest.mock("@/services/account-review-legacy-bootstrap-service", () => ({
  loadOrBootstrapOwnedSmsReviewSession: (
    input: LoadOrBootstrapSmsReviewInput
  ): Promise<AccountReviewSession> => mockBootstrap(input),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (): Promise<AccountReviewAccountSnapshots> =>
    mockOwnedRead(),
}));
jest.mock("@/services/account-review-command-service", () => ({
  executeSmsAccountReviewCommand: (...args: readonly unknown[]): unknown =>
    mockSmsCommand(...args),
}));
jest.mock("@/services/account-review-save-service", () => ({
  createAccountReviewSaveService: () => ({
    saveSelectedAccountReview: (input: ReviewSaveInput):
      Promise<AccountReviewSaveResult> => mockSave(input),
  }),
}));
jest.mock("@/services/sms-review-draft-save-service", () => {
  class SmsReviewDraftSaveValidationError extends Error {}
  return {
    SmsReviewDraftSaveValidationError,
    saveSelectedSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
      mockLegacySave(...args),
  };
});
jest.mock("@/services/sms-review-draft-command-service", () => ({
  discardEverySmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockDiscardAll(...args),
  editSmsReviewDraft: (): Promise<void> => Promise.resolve(),
  setSmsReviewDraftSelection: (): Promise<void> => Promise.resolve(),
  setSmsReviewDraftSelections: (): Promise<void> => Promise.resolve(),
}));
jest.mock("@/services/sms-live-detection-handler", () => ({
  setReviewingActive: (): void => undefined,
  flushQueuedTransactions: (): Promise<void> => Promise.resolve(),
}));
jest.mock("@/services/sms-safeguard-qa-diagnostics-service", () => ({
  createSmsSafeguardQaDiagnostics: (): null => null,
}));
jest.mock("@/hooks/useSmsReviewUndo", () => ({
  useSmsReviewUndo: () => ({
    undoItem: null, discardedName: null,
    undo: (): Promise<boolean> => Promise.resolve(false),
    discard: (): Promise<void> => Promise.resolve(),
    close: (): void => undefined,
  }),
}));
jest.mock("@/hooks/useSmsReviewRetry", () => ({
  useSmsReviewRetry: () => ({
    unresolvedCount: 0, retryableCount: 0,
    isRetrying: false, hasRetryError: false,
    isConsentRequired: false,
    dismissConsentRequired: (): void => undefined,
    retry: (): Promise<void> => Promise.resolve(),
  }),
}));
jest.mock("@/hooks/useAiProcessingConsent", () => ({
  useAiProcessingConsent: () => ({
    grantConsent: (): Promise<void> => Promise.resolve(),
  }),
}));
jest.mock("@/hooks/useSmsSync", () => ({
  useSmsSync: () => ({ markSyncComplete: mockMarkComplete }),
}));
jest.mock("@/components/transaction-review/TransactionReview", () => ({
  TransactionReview: (props: ReviewProps): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockReview(props);
    return <View testID={props.accountReview
      ? "sms-canonical-v2-review" : "sms-legacy-review"} />;
  },
}));
jest.mock("@/components/transaction-review/SmsReviewUndoBanner", () => ({
  SmsReviewUndoBanner: (): null => null,
}));
jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (): null => null,
}));
jest.mock("@/components/ai-consent/AiProcessingConsentSheet", () => ({
  AiProcessingConsentSheet: (): null => null,
}));
jest.mock("@/components/sms-sync/SafeguardQaDiagnosticsPanel", () => ({
  SafeguardQaDiagnosticsPanel: (): null => null,
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { readonly children: React.ReactNode }) => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View>{children}</View>;
  },
}));
jest.mock("expo-status-bar", () => ({ StatusBar: (): null => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest.requireActual<typeof import("node:crypto")>("node:crypto").randomUUID(),
}));

import SmsReviewScreen from "@/app/(private)/sms-review";

function lastReview(): ReviewProps {
  const props = mockReview.mock.lastCall?.[0];
  if (!props) throw new Error("sms_review_route_missing");
  return props;
}
function v2Boundary(): V2SmsBoundary {
  const result = lastReview().accountReview;
  if (!result) throw new Error("sms_route_missing_canonical_v2_boundary");
  return result;
}
function startV2(fixture: SaveFixture = makeSaveFixture("sms-new-bank")): SaveFixture {
  mockSession = fixture.session;
  mockQueueId = fixture.session.sessionId;
  mockItems = queueItems(fixture);
  render(<SmsReviewScreen />);
  return fixture;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockActor = OWNER;
  mockQueueId = SESSION;
  mockSession = makeSaveFixture("sms-new-bank").session;
  mockItems = queueItems(makeSaveFixture("sms-new-bank"));
  mockOwnedRead.mockResolvedValue({
    ...makeOwnedContext(), ownerId: OWNER,
  });
  mockBootstrap.mockImplementation(() => Promise.resolve(mockSession));
  mockSave.mockResolvedValue({ kind: "committed" });
  mockMarkComplete.mockResolvedValue(undefined);
  mockLegacySave.mockResolvedValue({ savedCount: 1 });
});

describe("#395 T054 SMS review owned queue-to-facade route", () => {
  it("SR01 passes current owned queue/session to the REAL canonical facade, not index state", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    expect(boundary.input).toMatchObject({
      mode: "SMS", ownerId: OWNER, queueId: SESSION,
      sessionId: SESSION,
    });
    const { result } = renderHook(() => useAccountReview(boundary.input));
    await waitFor(() => expect(result.current.session).toEqual(fixture.session));
    expect(mockBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      expectedOwnerId: OWNER, queueId: SESSION,
    }));
    expect(result.current.session?.rows.map(row => row.rowId))
      .toEqual(fixture.session.rows.map(row => row.rowId));
    expect(mockLegacySave).not.toHaveBeenCalled();
  });

  it("SR02 uses only the complete frozen account-review Save action and navigates after commit", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    const { result } = renderHook(() => useAccountReview(boundary.input));
    await waitFor(() => expect(result.current.session).toEqual(fixture.session));
    const authenticatedSession = result.current.session;
    if (!authenticatedSession) throw new Error("owned_facade_session_not_loaded");
    let complete!: (value: AccountReviewSaveResult) => void;
    mockSave.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = boundary.onSaveSelected(authenticatedSession); });
    const input = mockSave.mock.calls[0]?.[0];
    if (!input) throw new Error("account_review_financial_boundary_missing");
    expect(freezeSelectedAccountReview(input).session).toEqual(fixture.session);
    expect(input.intent).toEqual(fixture.intent);
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    await act(async () => { complete({ kind: "committed" }); await pending; });
    expect(mockReplace).toHaveBeenCalledWith(
      "/(private)/(tabs)/transactions"
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("SR03 rolls back UI saving feedback without clearing durable choices after Save failure", async () => {
    const fixture = startV2();
    const before = [...mockItems];
    const boundary = v2Boundary();
    mockSave.mockRejectedValueOnce(new Error("injected_owned_sqlite_rollback"));
    await act(async () => {
      await boundary.onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockItems).toEqual(before);
    expect(mockToast).toHaveBeenCalled();
  });

  it("SR04 Review later clears volatile scan UI, not durable v2 queue, group, or selected rows", () => {
    const fixture = startV2();
    v2Boundary();
    const route = lastReview();
    if (!route.onReviewLater) throw new Error("missing_sms_review_later");
    act(() => { route.onReviewLater?.(); });
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(private)/(tabs)");
    expect(mockDiscardAll).not.toHaveBeenCalled();
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSession).toEqual(fixture.session);
    expect(mockItems).toEqual(queueItems(fixture));
  });

  it("SR05 forbids old V2 callbacks from writing after logout/actor change", async () => {
    const fixture = startV2();
    const oldSave = v2Boundary().onSaveSelected;
    mockActor = null;
    let failed = false;
    await act(async () => {
      try { await oldSave(fixture.session); }
      catch { failed = true; }
    });
    expect(failed || mockToast.mock.calls.length > 0).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("SR06 fails closed for a newly active queue ID that conflicts with the durable session", () => {
    const fixture = makeSaveFixture("sms-new-bank");
    mockQueueId = testUuid(990);
    mockSession = fixture.session;
    mockItems = queueItems(fixture);
    render(<SmsReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("SR07 rejects a foreign current actor instead of reading another owner's durable drafts", () => {
    const fixture = makeSaveFixture("sms-new-bank");
    mockActor = FOREIGN_OWNER;
    mockSession = fixture.session;
    mockItems = queueItems(fixture);
    render(<SmsReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockBootstrap).not.toHaveBeenCalledWith(
      expect.objectContaining({ expectedOwnerId: OWNER })
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("SR08 rejects an old displayed SMS fingerprint instead of saving it over the owned facade", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    const staleFingerprint = "f".repeat(64);
    mockItems = queueItems(fixture).map((item, index) =>
      index === 0 ? {
        ...item,
        transaction: { ...item.transaction, smsFingerprint: staleFingerprint },
      } : item
    );
    const { result } = renderHook(() => useAccountReview(boundary.input));
    await waitFor(() => expect(result.current.session).toEqual(fixture.session));
    const staleRows = fixture.session.rows.map((row, index) =>
      index === 0 && row.source === "SMS"
        ? {
            ...row,
            sourceFingerprint: staleFingerprint,
            transaction: { ...row.transaction, smsFingerprint: staleFingerprint },
          }
        : row
    );
    const staleSession = accountReviewSessionSchema.parse({
      ...fixture.session, rows: staleRows,
    });
    await act(async () => {
      try { await boundary.onSaveSelected(staleSession); }
      catch { /* Canonical stale refusal may reject or surface UI feedback. */ }
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockLegacySave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current.session).toEqual(fixture.session);
  });
});
