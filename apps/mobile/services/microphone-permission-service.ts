import { AudioModule } from "expo-audio";

export type MicrophonePermissionStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "blocked";

function resolvePermission(result: {
  readonly granted: boolean;
  readonly canAskAgain?: boolean;
}): MicrophonePermissionStatus {
  return result.granted
    ? "granted"
    : result.canAskAgain === false
      ? "blocked"
      : "denied";
}

export async function readMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  return resolvePermission(await AudioModule.getRecordingPermissionsAsync());
}

/** Invoke only after the app's approved microphone explanation action. */
export async function requestMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  return resolvePermission(
    await AudioModule.requestRecordingPermissionsAsync()
  );
}
