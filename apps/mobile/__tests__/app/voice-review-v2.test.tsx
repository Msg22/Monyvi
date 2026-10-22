/** #395 T054 tests-first: actual VoiceReviewScreen, typed canonical v2 boundary. */
// Jest file-scope registration: Node SQLite replaces the native bridge before
// importing actual canonical fixtures, freeze logic or review routes/hooks.
// This is the proven Save-SQLite suite factory, not a financial/business mock.
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("../services/account-review-save-ledger-models")
  >("../services/account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Adapter({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});

import { act, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ReviewableTransaction } from "@monyvi/logic";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import type { UseAccountReviewInput } from "../../hooks/useAccountReview";
import type { AccountReviewSaveResult } from "../../services/account-review-save-service";
import {
  freezeSelectedAccountReview,
  type ReviewSaveInput,
} from "../../services/account-review-save-preparation";
import {
  makeSaveFixture,
  OWNER,
  FOREIGN_OWNER,
  type SaveFixture,
} from "../services/account-review-save-test-fixtures";

interface V2ReviewBoundary {
  readonly input: UseAccountReviewInput;
  readonly onSaveSelected: (session: AccountReviewSession) => Promise<void>;
}
interface ReviewProps {
  readonly transactions: readonly ReviewableTransaction[];
  readonly onSave: (
    selected: readonly ReviewableTransaction[],
    accounts: ReadonlyMap<number, string>,
    destinations: ReadonlyMap<number, string>
  ) => Promise<void>;
  readonly onDiscard: () => void;
  readonly isSaving: boolean;
  /** Proposed thin additive typed facade boundary, not a business-state copy. */
  readonly accountReview?: V2ReviewBoundary;
}
interface RouteParams {
  readonly transactions: string;
  readonly transcript: string;
  readonly originalTranscript: string;
  readonly detectedLanguage: string;
  readonly originTabIndex: string;
  readonly reviewSession?: string;
  readonly reviewFixtureSceneId?: string;
}
const mockReplace = jest.fn();
const mockToast = jest.fn();
const mockLegacyBatch = jest.fn();
const mockProvider = jest.fn();
const mockLoadFixtureScene = jest.fn();
const mockReview = jest.fn<void, [ReviewProps]>();
const mockSave = jest.fn<Promise<AccountReviewSaveResult>, [ReviewSaveInput]>();
let mockUser: string | null = OWNER;
let mockParams: RouteParams = {
  transactions: "[]",
  transcript: "",
  originalTranscript: "",
  detectedLanguage: "en",
  originTabIndex: "2",
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): RouteParams => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: mockUser, isResolvingUser: false }),
}));
jest.mock("@/hooks/useAccountReviewFixtureScene", () => ({
  useAccountReviewFixtureScene: (input: unknown): unknown =>
    mockLoadFixtureScene(input),
}));
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => Promise.resolve(mockUser),
}));
jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (...args: readonly unknown[]): unknown =>
    mockProvider(...args),
}));
jest.mock("@/services/batch-create-transactions", () => ({
  batchCreateTransactions: (...args: readonly unknown[]): unknown =>
    mockLegacyBatch(...args),
}));
jest.mock("@/services/account-review-save-service", () => ({
  createAccountReviewSaveService: () => ({
    saveSelectedAccountReview: (
      input: ReviewSaveInput
    ): Promise<AccountReviewSaveResult> => mockSave(input),
  }),
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));
jest.mock("@/components/transaction-review/TransactionReview", () => ({
  TransactionReview: (props: ReviewProps): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockReview(props);
    return (
      <View
        testID={
          props.accountReview
            ? "voice-canonical-v2-review"
            : "voice-legacy-review"
        }
      />
    );
  },
}));
jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: (): null => null,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({
    children,
    testID,
  }: {
    readonly children: React.ReactNode;
    readonly testID?: string;
  }): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID={testID}>{children}</View>;
  },
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (): null => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: "en", isRTL: false }),
}));

import VoiceReviewScreen from "@/app/(private)/voice-review";

function routeParams(fixture: SaveFixture): RouteParams {
  return {
    transactions: JSON.stringify(
      fixture.session.rows.map((row) => row.transaction)
    ),
    transcript: "Voice transcript",
    originalTranscript: "Original speech",
    detectedLanguage: "en",
    originTabIndex: "3",
    reviewSession: JSON.stringify(fixture.session),
  };
}
function lastReview(): ReviewProps {
  const props = mockReview.mock.lastCall?.[0];
  if (!props) throw new Error("missing_route_review");
  return props;
}
function v2Boundary(): V2ReviewBoundary {
  const boundary = lastReview().accountReview;
  if (!boundary) throw new Error("voice_route_missing_canonical_v2_boundary");
  return boundary;
}
function startV2(
  fixture: SaveFixture = makeSaveFixture("voice-shared")
): SaveFixture {
  mockParams = routeParams(fixture);
  render(<VoiceReviewScreen />);
  return fixture;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = OWNER;
  mockLoadFixtureScene.mockReturnValue({ status: "idle", session: null });
  mockLegacyBatch.mockResolvedValue({
    savedCount: 1,
    failedCount: 0,
    errors: [],
  });
  mockSave.mockResolvedValue({ kind: "committed" });
});

describe("#395 T054 Voice route boundary (real page, financial writer mocked)", () => {
  it("VR01 validates unknown route JSON into the exact typed Voice facade/Date graph", () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    expect(boundary.input).toMatchObject({
      mode: "VOICE",
      ownerId: OWNER,
      sessionId: fixture.session.sessionId,
    });
    if (boundary.input.mode !== "VOICE")
      throw new Error("v2_voice_mode_mismatch");
    const session = accountReviewSessionSchema.parse(
      boundary.input.voiceSession
    );
    expect(session).toEqual(fixture.session);
    expect(session.rows[0]?.transaction.date).toBeInstanceOf(Date);
    expect(session.groups).toEqual(fixture.session.groups);
    expect(screen.getByTestId("voice-canonical-v2-review")).toBeTruthy();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", "{"],
    ["incomplete", JSON.stringify({ source: "VOICE" })],
  ])("VR02 %s JSON refuses legacy review/save fallback", (_label, raw) => {
    const fixture = makeSaveFixture("voice-shared");
    mockParams = { ...routeParams(fixture), reviewSession: raw };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("VR03 rejects a structurally valid but foreign Voice owner", () => {
    const fixture = makeSaveFixture("voice-shared");
    const foreign = accountReviewSessionSchema.parse({
      ...fixture.session,
      ownerId: FOREIGN_OWNER,
      saveIntent: { ...fixture.intent, ownerId: FOREIGN_OWNER },
    });
    mockParams = {
      ...routeParams(fixture),
      reviewSession: JSON.stringify(foreign),
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("VR04 rejects wrong source/row provenance instead of rendering legacy", () => {
    const fixture = makeSaveFixture("voice-shared");
    mockParams = {
      ...routeParams(fixture),
      reviewSession: JSON.stringify({ ...fixture.session, source: "SMS" }),
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
  });

  it("VR05 forwards exact frozen selected input and waits for local atomic commit to navigate", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    let complete!: (result: AccountReviewSaveResult) => void;
    const pending = new Promise<AccountReviewSaveResult>((resolve) => {
      complete = resolve;
    });
    mockSave.mockReturnValueOnce(pending);
    let saving!: Promise<void>;
    act(() => {
      saving = boundary.onSaveSelected(fixture.session);
    });
    // The real immutable runtime capture first completes async owner
    // admission before the financial Save service is invoked. Do not mock
    // or short-circuit that boundary; retain the frozen-input assertions.
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const input = mockSave.mock.calls[0]?.[0];
    if (!input) throw new Error("canonical_save_input_missing");
    expect(freezeSelectedAccountReview(input).session).toEqual(fixture.session);
    expect(input.intent).toEqual(fixture.intent);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    await act(async () => {
      complete({ kind: "committed" });
      await saving;
    });
    expect(mockReplace).toHaveBeenCalledWith("/(private)/(tabs)/metals");
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it("VR06 failed atomic Save retains canonical choices and never invokes legacy Save", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    mockSave.mockRejectedValueOnce(new Error("injected_atomic_rollback"));
    await act(async () => {
      await boundary.onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    // The actual failure stays in the rejected financial boundary, not UI text.
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.getByTestId("review-inline-notice-page")).toBeTruthy();
    expect(screen.getByText("review_notice_save_title")).toBeTruthy();
    expect(screen.getByText("review_notice_save_message")).toBeTruthy();
    expect(v2Boundary().input).toMatchObject({
      ownerId: OWNER,
      sessionId: fixture.session.sessionId,
    });
  });

  it("VR06b distinguishes committed Save followed by failed navigation", async () => {
    const fixture = startV2();
    mockReplace.mockImplementationOnce(() => {
      throw new Error("private_navigation_details");
    });
    await act(async () => {
      await v2Boundary().onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(
      screen.getByText("review_notice_saved_navigation_title")
    ).toBeTruthy();
    expect(
      screen.getByText("review_notice_saved_navigation_message")
    ).toBeTruthy();
  });

  it("VR06c rejects unsupported Voice outcome without inventing success", async () => {
    const fixture = startV2();
    mockSave.mockResolvedValueOnce({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    await act(async () => {
      await v2Boundary().onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("review_notice_save_title")).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("VR06d retries the unchanged frozen Voice Save after a recoverable failure", async () => {
    const fixture = startV2();
    const boundary = v2Boundary();
    mockSave.mockRejectedValueOnce(new Error("private_first_error"));
    await act(async () => {
      await boundary.onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const first = mockSave.mock.calls[0]?.[0];
    await act(async () => {
      await boundary.onSaveSelected(fixture.session);
    });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave.mock.calls[1]?.[0].intent).toEqual(first?.intent);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("VR07 retains V1 legacy Save/navigation when canonical V2 session is absent", async () => {
    const fixture = makeSaveFixture("voice-existing");
    const params = routeParams(fixture);
    mockParams = {
      transactions: params.transactions,
      transcript: params.transcript,
      originalTranscript: params.originalTranscript,
      detectedLanguage: params.detectedLanguage,
      originTabIndex: params.originTabIndex,
    };
    render(<VoiceReviewScreen />);
    const route = lastReview();
    expect(route.accountReview).toBeUndefined();
    await act(async () => {
      await route.onSave(
        fixture.session.rows.map((row) => row.transaction),
        new Map(),
        new Map()
      );
    });
    expect(mockLegacyBatch).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(private)/(tabs)/metals");
  });
  it("VR08 opens a current-owner fixture Voice scene through the canonical boundary without route session JSON", () => {
    const fixture = makeSaveFixture("voice-shared");
    mockLoadFixtureScene.mockReturnValue({
      status: "ready",
      session: fixture.session,
    });
    mockParams = {
      transactions: "[]",
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      originTabIndex: "2",
      reviewFixtureSceneId: "r3-combined-en",
    };
    render(<VoiceReviewScreen />);
    expect(mockLoadFixtureScene).toHaveBeenCalledWith({
      sceneId: "r3-combined-en",
      ownerId: OWNER,
      isResolvingUser: false,
    });
    const boundary = v2Boundary();
    expect(boundary.input).toMatchObject({
      mode: "VOICE",
      ownerId: OWNER,
      sessionId: fixture.session.sessionId,
    });
    expect(screen.getByTestId("voice-canonical-v2-review")).toBeTruthy();
    expect(mockProvider).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("VR09 an unknown/rejected scene fails closed without opening legacy review or Save", () => {
    mockLoadFixtureScene.mockReturnValue({
      status: "unavailable",
      session: null,
    });
    mockParams = {
      transactions: "[]",
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      originTabIndex: "2",
      reviewFixtureSceneId: "not-registered",
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it("VR10 simultaneous canonical reviewSession JSON and scene alias are rejected instead of choosing a fallback", () => {
    const fixture = makeSaveFixture("voice-shared");
    mockLoadFixtureScene.mockReturnValue({
      status: "ready",
      session: fixture.session,
    });
    mockParams = {
      ...routeParams(fixture),
      reviewFixtureSceneId: "r3-combined-en",
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
  });

  it("VR11 signed-out owner cannot render an otherwise hydrated fixture scene", () => {
    const fixture = makeSaveFixture("voice-shared");
    mockLoadFixtureScene.mockReturnValue({
      status: "ready",
      session: fixture.session,
    });
    mockUser = null;
    mockParams = {
      transactions: "[]",
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      originTabIndex: "2",
      reviewFixtureSceneId: "r3-combined-en",
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("VR12 an SMS-sourced fixture never opens Voice canonical or legacy paths", () => {
    const fixture = makeSaveFixture("sms-new-bank");
    mockLoadFixtureScene.mockReturnValue({
      status: "ready",
      session: fixture.session,
    });
    mockParams = {
      transactions: "[]",
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      originTabIndex: "2",
      reviewFixtureSceneId: "r3-removed-undo",
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockLegacyBatch).not.toHaveBeenCalled();
  });

  it("VR13 loading fixture never renders an empty legacy transaction review", () => {
    mockLoadFixtureScene.mockReturnValue({
      status: "loading",
      session: null,
    });
    mockParams = {
      transactions: "[]",
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
      originTabIndex: "2",
      reviewFixtureSceneId: "r3-combined-en",
    };
    render(<VoiceReviewScreen />);
    expect(mockReview).not.toHaveBeenCalled();
    expect(screen.getByTestId("account-review-fixture-loading")).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(Skeleton)).toHaveLength(4);
    expect(screen.queryByText("loading")).toBeNull();
  });
});
