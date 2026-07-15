import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { QaCoverageDeclaration } from "@monyvi/logic";
import { QaSmsCoverageReview } from "@/components/qa-sms-pattern-intake/QaSmsCoverageReview";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): React.JSX.Element => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID="coverage-editor-header" />;
  },
}));

const pending: QaCoverageDeclaration = {
  providerId: "qnb-egypt",
  messageFamily: "atm_withdrawal",
  currency: "USD",
  status: "pending",
  candidateIds: [],
  recordedAt: "2026-07-13T00:00:00.000Z",
};

describe("QaSmsCoverageReview", () => {
  beforeAll(() => jest.useFakeTimers());
  afterEach(() => act(() => jest.runOnlyPendingTimers()));
  afterAll(() => jest.useRealTimers());

  it("renders virtualized rows, pending warning, disabled action, and safe area", () => {
    render(
      <QaSmsCoverageReview
        declarations={[pending]}
        pendingCount={1}
        onUpdate={jest.fn()}
        onMarkPendingUnavailable={jest.fn()}
        onContinue={jest.fn()}
        bottomInset={26}
      />
    );
    expect(screen.getByTestId("qa-sms-coverage-list")).toBeTruthy();
    expect(
      screen.getByTestId("qa-sms-coverage-group-atm_withdrawal")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("qa-sms-coverage-atm_withdrawal-usd")
    ).toBeNull();
    expect(screen.getByTestId("qa-sms-coverage-continue")).toBeDisabled();
    expect(screen.getByTestId("qa-sms-mark-pending-unavailable")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-coverage-actions")).toHaveStyle({
      paddingBottom: 26,
    });
  });

  it("edits status and keeps candidate-backed disabled without evidence", () => {
    const onUpdate = jest.fn();
    render(
      <QaSmsCoverageReview
        declarations={[pending]}
        pendingCount={1}
        onUpdate={onUpdate}
        onMarkPendingUnavailable={jest.fn()}
        onContinue={jest.fn()}
        bottomInset={20}
      />
    );
    fireEvent.press(screen.getByTestId("qa-sms-coverage-group-atm_withdrawal"));
    fireEvent.press(screen.getByTestId("qa-sms-coverage-atm_withdrawal-usd"));
    expect(screen.getByTestId("qa-sms-coverage-editor")).toBeTruthy();
    expect(screen.getByTestId("qa-sms-coverage-editor-actions")).toHaveStyle({
      paddingBottom: 20,
    });
    expect(
      screen.getByTestId("qa-sms-coverage-status-candidate_collected")
    ).toBeDisabled();
    fireEvent.press(
      screen.getByTestId("qa-sms-coverage-status-unavailable_in_qa_dataset")
    );
    fireEvent.press(screen.getByTestId("qa-sms-save-coverage-status"));
    expect(onUpdate).toHaveBeenCalledWith(
      "atm_withdrawal",
      "USD",
      "unavailable_in_qa_dataset"
    );
  });

  it("keeps unavailable disabled when a scope already has candidates", () => {
    const candidateBacked: QaCoverageDeclaration = {
      ...pending,
      status: "candidate_collected",
      candidateIds: ["candidate-1"],
    };
    render(
      <QaSmsCoverageReview
        declarations={[candidateBacked]}
        pendingCount={0}
        onUpdate={jest.fn()}
        onMarkPendingUnavailable={jest.fn()}
        onContinue={jest.fn()}
        bottomInset={20}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-coverage-group-atm_withdrawal"));
    fireEvent.press(screen.getByTestId("qa-sms-coverage-atm_withdrawal-usd"));

    expect(
      screen.getByTestId("qa-sms-coverage-status-unavailable_in_qa_dataset")
    ).toBeDisabled();
    expect(screen.getByTestId("qa-sms-coverage-status-pending")).toBeDisabled();
  });

  it("marks all pending scopes unavailable without changing rows itself", () => {
    const onMarkPendingUnavailable = jest.fn();
    render(
      <QaSmsCoverageReview
        declarations={[pending]}
        pendingCount={1}
        onUpdate={jest.fn()}
        onMarkPendingUnavailable={onMarkPendingUnavailable}
        onContinue={jest.fn()}
        bottomInset={20}
      />
    );

    fireEvent.press(screen.getByTestId("qa-sms-mark-pending-unavailable"));

    expect(onMarkPendingUnavailable).toHaveBeenCalledTimes(1);
  });
});
