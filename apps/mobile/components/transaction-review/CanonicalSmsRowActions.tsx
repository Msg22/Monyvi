import { useRef, useState } from "react";
import { View } from "react-native";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import type { TransactionReviewProps } from "./TransactionReview";
import { SmsReviewUndoBanner } from "./SmsReviewUndoBanner";

interface CanonicalSmsRowActions {
  readonly isBusy: boolean;
  readonly reportFailure: (
    stage: "discard" | "undo" | "footer_unhandled",
    error: unknown
  ) => void;
  readonly runMutation: (
    mutation: () => void | Promise<void>,
    stage: "discard" | "undo"
  ) => Promise<void>;
}

/** UI admission only. Durable row mutations stay in the owned route/services. */
export function useCanonicalSmsRowActions(input: {
  readonly isBusy: boolean;
  readonly signal?: AbortSignal;
  readonly reload: () => void;
  readonly feedback: ReviewFeedbackBoundary;
}): CanonicalSmsRowActions {
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);
  const runMutation: CanonicalSmsRowActions["runMutation"] = async (
    mutation,
    stage
  ) => {
    if (input.isBusy || inFlight.current || input.signal?.aborted) return;
    inFlight.current = true;
    setIsBusy(true);
    try {
      await mutation();
    } catch (error: unknown) {
      if (!input.signal?.aborted)
        input.feedback.reportFailure({ stage, surface: "page", error });
    } finally {
      // The reload callback is stamped by the facade: an obsolete owner/session
      // generation cannot reload a different review when this work completes.
      if (!input.signal?.aborted) input.reload();
      inFlight.current = false;
      setIsBusy(false);
    }
  };
  const reportFailure: CanonicalSmsRowActions["reportFailure"] = (
    stage,
    error
  ) => {
    if (!input.signal?.aborted)
      input.feedback.reportFailure({ stage, surface: "page", error });
  };
  return { isBusy, runMutation, reportFailure };
}

export function CanonicalSmsUndoBanner({
  undo,
  actions,
  isBusy,
}: {
  readonly undo: TransactionReviewProps["undoBanner"];
  readonly actions: CanonicalSmsRowActions;
  readonly isBusy: boolean;
}): React.JSX.Element | null {
  if (!undo) return null;
  return (
    <View className="px-5">
      <SmsReviewUndoBanner
        discardedName={undo.discardedName}
        onUndo={() => actions.runMutation(undo.onUndo, "undo")}
        onClose={() => {
          if (!isBusy) undo.onClose();
        }}
      />
    </View>
  );
}
