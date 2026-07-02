/**
 * SMS Headless Task (Tier 2)
 *
 * Registered as a React Native Headless JS task that runs when the app
 * is killed/terminated. The native `SmsBroadcastReceiver` starts a
 * `HeadlessJsTaskService` which invokes this task with the SMS data.
 *
 * @module sms-headless-task
 */

import { AppRegistry } from "react-native";
import { handleDetectedSms } from "./sms-live-detection-handler";
import { processLiveSmsEvent } from "./sms-live-processor";

/** Payload from the native SmsBroadcastReceiver */
interface SmsTaskData {
  readonly sender: string;
  readonly body: string;
  readonly timestamp: number;
}

/** Name used in both AppRegistry.registerHeadlessTask and the native service. */
const SMS_DETECTION_TASK = "SmsDetectionTask";

interface HeadlessJsTaskErrorModule {
  readonly default: new () => Error;
}

function createHeadlessJsRetryError(): Error {
  const { default: HeadlessJsTaskError } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- RN 0.83 does not expose HeadlessJsTaskError publicly yet.
    require("react-native/Libraries/ReactNative/HeadlessJsTaskError") as HeadlessJsTaskErrorModule;
  return new HeadlessJsTaskError();
}

/**
 * Headless JS task handler.
 *
 * Runs without UI when the native BroadcastReceiver starts the service.
 */
async function smsDetectionTask(taskData: SmsTaskData): Promise<void> {
  const result = await processLiveSmsEvent({
    sender: taskData.sender,
    body: taskData.body,
    timestamp: taskData.timestamp,
    deliveryMode: "headless",
  });

  if (result.status === "ai_failed" && result.isRetryable !== false) {
    throw createHeadlessJsRetryError();
  }

  if (result.status !== "parsed") {
    return;
  }

  for (const parsed of result.transactions) {
    await handleDetectedSms(parsed);
  }
}

/**
 * Register the headless JS task.
 *
 * Must be called at the top level of the app entry point (index.js)
 * for Headless JS to work when the app process is restarted by Android.
 */
export function registerSmsHeadlessTask(): void {
  AppRegistry.registerHeadlessTask(SMS_DETECTION_TASK, () => smsDetectionTask);
}
