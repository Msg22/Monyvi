/**
 * #395 review transcript fixtures — route wiring test.
 *
 * Proves the dev-only route gates on the real runtime availability predicate,
 * hands launched sessions to the EXISTING `/voice-review` route, and never
 * saves from the catalogue itself.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { AccountReviewSession } from "@monyvi/logic";
import { accountReviewSessionSchema } from "../../../../packages/logic/src/account-review/review-schemas";

import type {
  ReviewTranscriptFixtureCatalogItem,
  ReviewTranscriptFixtureLaunchHandoff,
  UseReviewTranscriptFixturesInput,
} from "../../hooks/useReviewTranscriptFixtures";

const OWNER = "00000000-0000-4000-8000-000000000101";
const SESSION_ID = "00000000-0000-4000-8000-000000000301";
const SCENARIO_ID = "voice-bank-expense-egp";

interface PushPayload {
  readonly pathname: string;
  readonly params: Readonly<Record<string, string>>;
}

const mockPush = jest.fn<void, [PushPayload]>();
const mockBack = jest.fn<void, []>();
let mockRuntimeAvailable = true;
let mockHandoff:
  | ((handoff: ReviewTranscriptFixtureLaunchHandoff) => void)
  | null = null;
const mockLaunch = jest.fn<void, [string]>();
const mockPrepareAccounts = jest.fn<void, []>();

const ITEM: ReviewTranscriptFixtureCatalogItem = {
  id: "voice-bank-expense-egp",
  label: "Bank expense, explicit EGP",
  transcript: "Paid 120 EGP at QNB for groceries",
  detectedLanguage: "en",
  rowCount: 1,
  currencyStates: ["known"],
  accountEvidenceStates: ["explicit"],
  roleLabels: ["TEST Bank"],
  missingRoleLabels: [],
};

jest.mock("expo-router", () => ({
  router: {
    push: (input: PushPayload): void => mockPush(input),
    back: (): void => mockBack(),
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 10, bottom: 24, left: 0, right: 0 }),
}));
jest.mock("@/services/review-transcript-fixtures-launcher-service", () => ({
  isReviewTranscriptFixturesRuntimeAvailable: (): boolean =>
    mockRuntimeAvailable,
}));
jest.mock("@/hooks/useReviewTranscriptFixtures", () => ({
  useReviewTranscriptFixtures: (
    input: UseReviewTranscriptFixturesInput
  ): Readonly<Record<string, unknown>> => {
    mockHandoff = input.onLaunched;
    return {
      status: "ready",
      items: [ITEM],
      preferredCurrency: "EGP",
      isPreparing: false,
      setupResult: null,
      launchErrorReason: null,
      isLaunchingId: null,
      prepareAccounts: (): Promise<void> => {
        mockPrepareAccounts();
        return Promise.resolve();
      },
      launch: (scenarioId: string): Promise<void> => {
        mockLaunch(scenarioId);
        return Promise.resolve();
      },
    };
  },
}));
jest.mock(
  "@/components/review-transcript-fixtures/TranscriptFixtureCatalog",
  () => {
    const { View, TouchableOpacity } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return {
      TranscriptFixtureCatalog: (props: {
        readonly onLaunch: (scenarioId: string) => void;
        readonly onBack: () => void;
        readonly bottomInset: number;
      }): React.JSX.Element => (
        <View
          testID="catalog-mock"
          accessibilityHint={String(props.bottomInset)}
        >
          <TouchableOpacity testID="catalog-launch" onPress={props.onBack} />
          <TouchableOpacity
            testID="catalog-launch-scenario"
            onPress={() => props.onLaunch(SCENARIO_ID)}
          />
        </View>
      ),
    };
  }
);

import ReviewTranscriptFixturesScreen from "@/app/(private)/review-transcript-fixtures";

const SESSION: AccountReviewSession = accountReviewSessionSchema.parse({
  ownerId: OWNER,
  source: "VOICE",
  sessionId: SESSION_ID,
  sourceRevision: "0",
  preferredCurrency: "EGP",
  rows: [],
  groups: [],
  removedEvidenceKeys: [],
  filter: "all",
  revision: "0",
  operationGeneration: "0",
  saveIntent: null,
});

describe("#395 review transcript fixtures route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntimeAvailable = true;
    mockHandoff = null;
  });

  it("renders nothing outside a real development runtime", () => {
    mockRuntimeAvailable = false;
    render(<ReviewTranscriptFixturesScreen />);
    expect(screen.queryByTestId("catalog-mock")).toBeNull();
  });

  it("matches the approved bottom-inset contract and routes back", () => {
    render(<ReviewTranscriptFixturesScreen />);
    expect(screen.getByTestId("catalog-mock")).toBeTruthy();
    expect(screen.getByTestId("catalog-mock").props.accessibilityHint).toBe(
      "24"
    );
    fireEvent.press(screen.getByTestId("catalog-launch"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("delegates a fixture launch to the service and never saves locally", () => {
    render(<ReviewTranscriptFixturesScreen />);
    fireEvent.press(screen.getByTestId("catalog-launch-scenario"));
    expect(mockLaunch).toHaveBeenCalledWith(SCENARIO_ID);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the EXISTING voice review route with the canonical session", () => {
    render(<ReviewTranscriptFixturesScreen />);
    if (mockHandoff === null) throw new Error("hook handoff not captured");
    mockHandoff({
      session: SESSION,
      transcript: "Paid 120 EGP at QNB for groceries",
      detectedLanguage: "en",
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0]?.[0];
    if (arg === undefined) throw new Error("missing_push_payload");
    expect(arg.pathname).toBe("/voice-review");
    expect(arg.params.originTabIndex).toBe("2");
    expect(arg.params.detectedLanguage).toBe("EN");
    expect(arg.params.transcript).toBe(arg.params.originalTranscript);
    const parsed = JSON.parse(arg.params.reviewSession ?? "{}") as {
      readonly sessionId?: string;
      readonly ownerId?: string;
      readonly source?: string;
    };
    expect(parsed.sessionId).toBe(SESSION_ID);
    expect(parsed.ownerId).toBe(OWNER);
    expect(parsed.source).toBe("VOICE");
  });
});
