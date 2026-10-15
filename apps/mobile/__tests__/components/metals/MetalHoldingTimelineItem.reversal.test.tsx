import React from "react";
import { render, screen } from "@testing-library/react-native";

import { MetalHoldingTimelineItem } from "@/components/metals/MetalHoldingTimelineItem";
import type { MetalDetailTimelineItem } from "@/services/metal-detail-read-model-service";
import englishMetals from "@/locales/en/metals.json";
import arabicMetals from "@/locales/ar/metals.json";

let mockLanguage: "en" | "ar" = "en";
const mockTranslations = { en: englishMetals, ar: arabicMetals };

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: mockLanguage },
    t: (key: string): string => {
      if (!key.startsWith("timeline.")) return key;
      const timelines: Readonly<Record<string, string>> =
        mockTranslations[mockLanguage].timeline;
      return timelines[key.slice("timeline.".length)] ?? key;
    },
  }),
}));

function terminalItem(
  kind: "sell" | "dispose",
  reversedByEventId: string | null
): MetalDetailTimelineItem {
  return {
    id: "terminal-1",
    kind,
    occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    reversedByEventId,
  };
}

describe("localized terminal reversal timeline display", (): void => {
  it.each(["en", "ar"] as const)(
    "visibly and accessibly marks only a restored terminal event in %s",
    (language): void => {
      mockLanguage = language;
      const timeline = mockTranslations[language].timeline;
      render(
        <MetalHoldingTimelineItem
          isFirst
          isLast
          item={terminalItem("sell", "undo-1")}
        />
      );
      expect(
        screen.getByTestId("metal-history-reversed-terminal-1")
      ).toHaveTextContent(` · ${timeline.reversed}`);
      expect(
        screen.getByLabelText(
          new RegExp(timeline.sell + ".*" + timeline.reversed)
        )
      ).toBeTruthy();
    }
  );

  it.each(["en", "ar"] as const)(
    "does not suggest an un-reversed disposal was restored in %s",
    (language): void => {
      mockLanguage = language;
      const timeline = mockTranslations[language].timeline;
      render(
        <MetalHoldingTimelineItem
          isFirst
          isLast
          item={terminalItem("dispose", null)}
        />
      );
      expect(
        screen.getByTestId("metal-holding-timeline-terminal-1")
      ).toBeTruthy();
      expect(
        screen.queryByTestId("metal-history-reversed-terminal-1")
      ).toBeNull();
      expect(screen.getByLabelText(new RegExp(timeline.dispose))).toBeTruthy();
    }
  );
});
