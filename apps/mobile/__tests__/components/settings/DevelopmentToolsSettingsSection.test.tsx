import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { DevelopmentToolsSettingsSection } from "@/components/settings/SettingsSections";

const t = (key: string): string => key;

describe("DevelopmentToolsSettingsSection", () => {
  it("shows the QA SMS pattern intake entry and opens it when available", () => {
    const onQaSmsPatternIntakePress = jest.fn();

    render(
      <DevelopmentToolsSettingsSection
        t={t}
        isVisible
        isStartupQaVisible={false}
        isSmsProviderEvaluationVisible={false}
        isReviewTranscriptFixturesVisible={false}
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={onQaSmsPatternIntakePress}
        onStartupQaPress={jest.fn()}
        onSmsProviderEvaluationPress={jest.fn()}
        onReviewTranscriptFixturesPress={jest.fn()}
      />
    );

    expect(screen.getByText("development_tools")).toBeTruthy();
    expect(screen.getByText("qa_sms_pattern_intake")).toBeTruthy();
    expect(screen.getByText("qa_sms_pattern_intake_description")).toBeTruthy();

    fireEvent.press(screen.getByTestId("qa-sms-pattern-intake-settings-link"));

    expect(onQaSmsPatternIntakePress).toHaveBeenCalledTimes(1);
  });

  it("opens startup QA from development tools without exposing SMS intake", () => {
    const onStartupQaPress = jest.fn();
    render(
      <DevelopmentToolsSettingsSection
        t={t}
        isVisible={false}
        isStartupQaVisible
        isSmsProviderEvaluationVisible={false}
        isReviewTranscriptFixturesVisible={false}
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={jest.fn()}
        onStartupQaPress={onStartupQaPress}
        onSmsProviderEvaluationPress={jest.fn()}
        onReviewTranscriptFixturesPress={jest.fn()}
      />
    );

    expect(screen.getByText("development_tools")).toBeTruthy();
    expect(screen.getByText("startup_qa_rates")).toBeTruthy();
    expect(screen.queryByText("qa_sms_pattern_intake")).toBeNull();
    fireEvent.press(screen.getByTestId("startup-qa-rates-settings-link"));
    expect(onStartupQaPress).toHaveBeenCalledTimes(1);
  });

  it("does not expose the development entry when unavailable", () => {
    render(
      <DevelopmentToolsSettingsSection
        t={t}
        isVisible={false}
        isStartupQaVisible={false}
        isSmsProviderEvaluationVisible={false}
        isReviewTranscriptFixturesVisible={false}
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={jest.fn()}
        onStartupQaPress={jest.fn()}
        onSmsProviderEvaluationPress={jest.fn()}
        onReviewTranscriptFixturesPress={jest.fn()}
      />
    );

    expect(screen.queryByText("development_tools")).toBeNull();
    expect(screen.queryByText("qa_sms_pattern_intake")).toBeNull();
    expect(
      screen.queryByTestId("review-transcript-fixtures-settings-link")
    ).toBeNull();
  });

  it("shows the dev-only review transcript fixtures link and opens it", () => {
    const onReviewTranscriptFixturesPress = jest.fn();
    render(
      <DevelopmentToolsSettingsSection
        t={t}
        isVisible={false}
        isStartupQaVisible={false}
        isSmsProviderEvaluationVisible={false}
        isReviewTranscriptFixturesVisible
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={jest.fn()}
        onStartupQaPress={jest.fn()}
        onSmsProviderEvaluationPress={jest.fn()}
        onReviewTranscriptFixturesPress={onReviewTranscriptFixturesPress}
      />
    );

    expect(screen.getByText("development_tools")).toBeTruthy();
    expect(screen.getByText("review_transcript_fixtures")).toBeTruthy();
    expect(
      screen.getByText("review_transcript_fixtures_description")
    ).toBeTruthy();
    expect(screen.queryByText("qa_sms_pattern_intake")).toBeNull();

    fireEvent.press(
      screen.getByTestId("review-transcript-fixtures-settings-link")
    );
    expect(onReviewTranscriptFixturesPress).toHaveBeenCalledTimes(1);
  });
});
