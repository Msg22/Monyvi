import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  logReviewFailure,
  type ReviewFailureSource,
  type ReviewFailureStage,
} from "@/services/account-review-feedback-diagnostics";

export type { ReviewFailureStage } from "@/services/account-review-feedback-diagnostics";
export type ReviewNoticeSurface = "page" | "modal";
export type ReviewNoticeTone = "error" | "warning" | "success";

export interface ReviewNotice {
  readonly tone: ReviewNoticeTone;
  readonly title: string;
  readonly message: string;
  readonly action?: {
    readonly label: string;
    readonly onPress: () => void;
  };
}

export interface ReportReviewFailure {
  readonly stage: ReviewFailureStage;
  readonly surface: ReviewNoticeSurface;
  readonly error?: unknown;
  readonly reasonCodes?: readonly string[];
}

export interface ShowReviewNotice extends ReviewNotice {
  readonly surface: ReviewNoticeSurface;
}

export interface ReviewFeedbackBoundary {
  readonly pageNotice: ReviewNotice | null;
  readonly modalNotice: ReviewNotice | null;
  readonly reportFailure: (input: ReportReviewFailure) => void;
  readonly showNotice: (input: ShowReviewNotice) => void;
  readonly dismiss: (surface: ReviewNoticeSurface) => void;
}

function reviewNoticeKeys(
  stage: ReviewFailureStage,
  code: string
): {
  readonly title: string;
  readonly message: string;
  readonly tone: ReviewNoticeTone;
} {
  if (stage === "navigation_after_save") {
    return {
      title: "review_notice_saved_navigation_title",
      message: "review_notice_saved_navigation_message",
      tone: "warning",
    };
  }
  if (stage === "scan_bookkeeping") {
    return {
      title: "review_notice_scan_bookkeeping_title",
      message: "review_notice_scan_bookkeeping_message",
      tone: "warning",
    };
  }
  if (
    code === "account_review_save_category_stale" ||
    code === "category_needed"
  ) {
    return {
      title: "review_notice_category_title",
      message: "review_notice_category_message",
      tone: "warning",
    };
  }
  if (
    stage === "route_admission" ||
    code === "account_review_save_actor_changed" ||
    code === "account_review_runtime_actor_changed" ||
    code === "account_review_voice_scope_changed" ||
    code === "account_review_sms_session_scope_changed" ||
    code === "account_review_sms_display_queue_changed" ||
    code === "AUTH_SCOPE_CHANGED" ||
    code === "USER_REQUIRED" ||
    code === "OWNERSHIP_FAILED" ||
    code === "review_owner_changed" ||
    code === "review_source_changed"
  ) {
    return {
      title: "review_notice_scope_title",
      message: "review_notice_scope_message",
      tone: "warning",
    };
  }
  if (stage === "command" || stage === "undo" || stage === "discard") {
    return {
      title: "review_notice_action_title",
      message: "review_notice_action_message",
      tone: "warning",
    };
  }
  if (stage === "retry_consent") {
    return {
      title: "review_notice_retry_title",
      message: "review_notice_retry_message",
      tone: "warning",
    };
  }
  return {
    title: "review_notice_save_title",
    message: "review_notice_save_message",
    tone: "error",
  };
}

/** One local notice per surface, never a global toast or timed overlay. */
export function useReviewNotice(input: {
  readonly source: ReviewFailureSource;
}): ReviewFeedbackBoundary {
  const { t } = useTranslation("transactions");
  const [pageNotice, setPageNotice] = useState<ReviewNotice | null>(null);
  const [modalNotice, setModalNotice] = useState<ReviewNotice | null>(null);
  const dismiss = useCallback((surface: ReviewNoticeSurface): void => {
    if (surface === "modal") setModalNotice(null);
    else setPageNotice(null);
  }, []);
  const showNotice = useCallback((notice: ShowReviewNotice): void => {
    const { surface, ...visible } = notice;
    if (surface === "modal") setModalNotice(visible);
    else setPageNotice(visible);
  }, []);
  const reportFailure = useCallback(
    (failure: ReportReviewFailure): void => {
      const diagnostic = logReviewFailure({
        source: input.source,
        stage: failure.stage,
        error: failure.error,
        reasonCodes: failure.reasonCodes,
      });
      const keys = reviewNoticeKeys(failure.stage, diagnostic.code);
      showNotice({
        surface: failure.surface,
        tone: keys.tone,
        title: t(keys.title),
        message: t(keys.message),
      });
    },
    [input.source, showNotice, t]
  );
  return { pageNotice, modalNotice, reportFailure, showNotice, dismiss };
}
