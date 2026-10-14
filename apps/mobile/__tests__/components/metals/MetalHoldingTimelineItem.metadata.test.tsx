import React from "react";
import { render, screen } from "@testing-library/react-native";
import { MetalHoldingTimelineItem } from "@/components/metals/MetalHoldingTimelineItem";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>): string => {
      if (key === "timeline.change")
        return `${values?.field}: ${values?.before} → ${values?.after}`;
      if (key === "edit.not_recorded") return "Not recorded";
      if (key === "edit.fields.name") return "Name";
      if (key === "edit.fields.notes") return "Notes";
      return key;
    },
  }),
}));

describe("applied metadata History presentation", () => {
  it("renders exact persisted Name and Notes deltas including null clears in accessible History", () => {
    render(
      <MetalHoldingTimelineItem
        isFirst
        isLast
        item={{
          id: "metadata:edit-1",
          kind: "metadata",
          occurredAt: new Date("2026-10-10T13:00:00.000Z"),
          correctionChanges: [
            { field: "name", before: "Old name", after: "New name" },
            { field: "notes", before: "Saved note", after: null },
          ],
        }}
      />
    );
    expect(screen.getByText("Name: Old name → New name")).toBeTruthy();
    expect(screen.getByText("Notes: Saved note → Not recorded")).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Name: Old name → New name.*Notes: Saved note → Not recorded/
      )
    ).toBeTruthy();
    expect(screen.queryByText("timeline.change_unavailable")).toBeNull();
  });

  it("renders a mixed material correction with its metadata delta in the same History row", () => {
    render(
      <MetalHoldingTimelineItem
        isFirst
        isLast
        item={{
          id: "action-1",
          kind: "correct",
          occurredAt: new Date("2026-10-10T13:00:00.000Z"),
          correctionChanges: [
            { field: "purchaseCurrency", before: "USD", after: "EGP" },
            { field: "notes", before: null, after: "Exact note" },
          ],
        }}
      />
    );
    expect(screen.getByText("Notes: Not recorded → Exact note")).toBeTruthy();
    expect(screen.getByTestId("metal-history-change-action-1-0")).toBeTruthy();
    expect(screen.getByTestId("metal-history-change-action-1-1")).toBeTruthy();
  });
});
