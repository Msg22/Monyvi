/**
 * #395 review transcript fixtures — development-only route.
 *
 * Lists fixed natural Voice transcripts and opens the EXISTING `/voice-review`
 * route with a pre-parsed canonical Voice session, so the real guarded Save
 * runs unchanged. No simulated Review screen, no fake Save, no provider call.
 *
 * @module review-transcript-fixtures
 */

import React from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TranscriptFixtureCatalog } from "@/components/review-transcript-fixtures/TranscriptFixtureCatalog";
import { useReviewTranscriptFixtures } from "@/hooks/useReviewTranscriptFixtures";
import { isReviewTranscriptFixturesRuntimeAvailable } from "@/services/review-transcript-fixtures-launcher-service";

function AvailableReviewTranscriptFixturesScreen(): React.JSX.Element {
  const { t } = useTranslation("settings");
  const insets = useSafeAreaInsets();
  const fixtures = useReviewTranscriptFixtures({
    onLaunched: ({ session, transcript, detectedLanguage }) => {
      router.push({
        pathname: "/voice-review",
        params: {
          reviewSession: JSON.stringify(session),
          transcript,
          originalTranscript: transcript,
          detectedLanguage: detectedLanguage.toUpperCase(),
          originTabIndex: "2",
        },
      });
    },
  });

  return (
    <TranscriptFixtureCatalog
      t={t}
      status={fixtures.status}
      items={fixtures.items}
      preferredCurrency={fixtures.preferredCurrency}
      isPreparing={fixtures.isPreparing}
      setupResult={fixtures.setupResult}
      launchErrorReason={fixtures.launchErrorReason}
      isLaunchingId={fixtures.isLaunchingId}
      bottomInset={insets.bottom}
      onBack={() => router.back()}
      onPrepareAccounts={() => {
        void fixtures.prepareAccounts();
      }}
      onLaunch={(scenarioId) => {
        void fixtures.launch(scenarioId);
      }}
    />
  );
}

export default function ReviewTranscriptFixturesScreen(): React.JSX.Element | null {
  if (!isReviewTranscriptFixturesRuntimeAvailable()) return null;
  return <AvailableReviewTranscriptFixturesScreen />;
}
