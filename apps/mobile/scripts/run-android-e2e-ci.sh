#!/usr/bin/env bash
set -euo pipefail

timeout "${E2E_ADB_WAIT_TIMEOUT_SECONDS:-120}"s adb wait-for-device
device_state="$(adb get-state)"
if [ "$device_state" != "device" ]; then
  echo "Android device is not ready. Current state: ${device_state}" >&2
  exit 1
fi

adb logcat -c
apk_path="${E2E_ANDROID_APK_PATH:-apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk}"
if [ ! -f "$apk_path" ]; then
  echo "Android debug APK not found at ${apk_path}." >&2
  exit 1
fi
adb install -r "$apk_path"
adb reverse tcp:8081 tcp:8081

metro_url="${E2E_HOST_METRO_URL:-http://127.0.0.1:8081}"
status_url="${metro_url%/}/status"
metro_wait_timeout_seconds="${E2E_METRO_WAIT_TIMEOUT_SECONDS:-240}"

echo "Waiting for Metro status at ${status_url}"
deadline=$((SECONDS + metro_wait_timeout_seconds))
until curl --fail --silent --show-error --max-time 10 "$status_url" >/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Metro did not become ready at ${status_url} within ${metro_wait_timeout_seconds}s." >&2
    exit 1
  fi
  sleep 2
done

bundle_url="${metro_url%/}/index.bundle?platform=android&dev=true&minify=false"
bundle_wait_timeout_seconds="${E2E_METRO_BUNDLE_TIMEOUT_SECONDS:-240}"
echo "Prewarming Metro Android bundle at ${bundle_url}"
if ! curl --fail --silent --show-error --max-time "$bundle_wait_timeout_seconds" "$bundle_url" >/dev/null; then
  echo "Metro Android bundle prewarm did not finish within ${bundle_wait_timeout_seconds}s; continuing with app-driven bundling." >&2
fi

set +e
e2e_output_log="android-e2e-output.log"
npm run e2e:ci -w @monyvi/mobile 2>&1 | tee "$e2e_output_log"
e2e_status=$?
timeout "${E2E_LOGCAT_TIMEOUT_SECONDS:-30}"s adb logcat -d > android-e2e-logcat.log || true
if [ "$e2e_status" -ne 0 ]; then
  {
    echo "Android E2E failed. Last E2E output lines:"
    tail -n 80 "$e2e_output_log"
    echo ""
    echo "Last Metro output lines:"
    tail -n 80 metro.log 2>/dev/null || true
  } > android-e2e-failure-summary.log
  {
    annotation_message="$(sed -e 's/%/%25/g' -e 's/\r/%0D/g' -e ':a;N;$!ba;s/\n/%0A/g' android-e2e-failure-summary.log | cut -c 1-8000)"
    echo "::error title=Android E2E failed::${annotation_message}"
  } || true
fi
exit "$e2e_status"
