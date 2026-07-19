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
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={onQaSmsPatternIntakePress}
      />
    );

    expect(screen.getByText("development_tools")).toBeTruthy();
    expect(screen.getByText("qa_sms_pattern_intake")).toBeTruthy();
    expect(screen.getByText("qa_sms_pattern_intake_description")).toBeTruthy();

    fireEvent.press(screen.getByTestId("qa-sms-pattern-intake-settings-link"));

    expect(onQaSmsPatternIntakePress).toHaveBeenCalledTimes(1);
  });

  it("does not expose the development entry when unavailable", () => {
    render(
      <DevelopmentToolsSettingsSection
        t={t}
        isVisible={false}
        chevronColor="#64748b"
        onQaSmsPatternIntakePress={jest.fn()}
      />
    );

    expect(screen.queryByText("development_tools")).toBeNull();
    expect(screen.queryByText("qa_sms_pattern_intake")).toBeNull();
  });
});
