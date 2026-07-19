import fs from "node:fs";
import path from "node:path";

function readCiWorkflow(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../..", ".github/workflows/ci.yml"),
    "utf8"
  );
}

function readAndroidE2eRunner(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../..", "scripts/run-android-e2e-ci.sh"),
    "utf8"
  );
}

function getWorkflowJobBlock(workflow: string, jobName: string): string {
  const marker = `\n  ${jobName}:\n`;
  const markerIndex = workflow.indexOf(marker);

  expect(markerIndex).toBeGreaterThanOrEqual(0);

  const remainingWorkflow = workflow.slice(markerIndex + 1);
  const nextJobIndex = remainingWorkflow.search(/\n {2}\S/);

  return nextJobIndex === -1
    ? remainingWorkflow
    : remainingWorkflow.slice(0, nextJobIndex);
}

function getAndroidE2eEmulatorRunnerBlock(workflow: string): string {
  const marker = "uses: reactivecircus/android-emulator-runner@v2";
  const markerIndex = workflow.indexOf(marker);

  expect(markerIndex).toBeGreaterThanOrEqual(0);

  const remainingWorkflow = workflow.slice(markerIndex);
  const nextStepIndex = remainingWorkflow.indexOf("\n      - name:", 1);

  return nextStepIndex === -1
    ? remainingWorkflow
    : remainingWorkflow.slice(0, nextStepIndex);
}

describe("GitHub Actions Android E2E workflow", () => {
  it("runs E2E scope resolution and Android E2E only on the main branch", () => {
    const workflow = readCiWorkflow();
    const e2eScopeJob = getWorkflowJobBlock(workflow, "e2e-scope");
    const androidE2eJob = getWorkflowJobBlock(workflow, "android-e2e");
    const mainBranchGuard = "github.ref == 'refs/heads/main'";

    expect(e2eScopeJob).toContain(`if: ${mainBranchGuard}`);
    expect(androidE2eJob).toContain(mainBranchGuard);
    expect(androidE2eJob).toContain(
      "needs.e2e-scope.outputs.should_run ==\n      'true'"
    );
  });

  it("uses an explicit emulator data partition that fits hosted runner disk space", () => {
    const workflow = readCiWorkflow();
    const emulatorRunnerBlock = getAndroidE2eEmulatorRunnerBlock(workflow);

    expect(emulatorRunnerBlock).toContain("disk-size: 4096M");
  });

  it("cancels superseded runs and executes selected E2E suites in parallel", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain(
      "matrix: ${{ fromJSON(needs.e2e-scope.outputs.matrix) }}"
    );
    expect(workflow).toContain("E2E_CI_SUITES: ${{ matrix.suite }}");
    expect(workflow).toContain("needs: [e2e-scope, quality, android-build]");
    expect(workflow).not.toContain(
      "android-build:\n    name: Android Build Verification\n    runs-on: ubuntu-latest\n    timeout-minutes: 60\n    needs: quality"
    );
  });

  it("passes the matrix suite to shell through the step environment", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("MATRIX_SUITE: ${{ matrix.suite }}");
    expect(workflow).toContain(
      'MAESTRO_E2E_EMAIL="e2e-${GITHUB_RUN_ID}-${MATRIX_SUITE}@monyvi.test"'
    );
    expect(workflow).not.toContain(
      'MAESTRO_E2E_EMAIL="e2e-${GITHUB_RUN_ID}-${{ matrix.suite }}@monyvi.test"'
    );
  });

  it("caches Gradle and the Android emulator while failing E2E once", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("uses: gradle/actions/setup-gradle@v4");
    expect(workflow).toContain("id: avd-cache");
    expect(workflow).toContain("force-avd-creation: false");
    expect(workflow).toContain("-no-snapshot-save");
    expect(workflow).toContain('E2E_DEVICE_OFFLINE_RETRY_COUNT: "1"');
    expect(workflow).toContain('E2E_SMS_SYNC_FLOW_ATTEMPT_COUNT: "1"');
    expect(workflow).toContain('EXPO_UNSTABLE_HEADLESS: "1"');
    expect(workflow).toContain("android-e2e-logs-${{ matrix.suite }}");
  });

  it("reuses the dev-client APK when native build inputs are unchanged", () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain("id: apk-cache");
    expect(workflow).toContain("monyvi-debug-apk-v1-${{ runner.os }}-${{");
    expect(workflow).toContain("hashFiles('package-lock.json'");
    expect(workflow).toContain("'apps/mobile/app.json'");
    expect(workflow).toContain("'apps/mobile/plugins/**'");
    expect(workflow).toContain("'apps/mobile/assets/**'");
    expect(workflow).toContain(
      "if: steps.apk-cache.outputs.cache-hit != 'true'"
    );
  });

  it("restores the APK cache directly in E2E jobs without artifact storage", () => {
    const workflow = readCiWorkflow();
    const runner = readAndroidE2eRunner();

    expect(workflow).toContain("uses: actions/cache/restore@v4");
    expect(workflow).not.toContain("name: Download Android debug APK");
    expect(workflow).not.toContain("name: Upload APK");
    expect(runner).toContain(
      "apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
    );
  });

  it("uploads E2E failure logs without making artifact quota a test failure", () => {
    const workflow = readCiWorkflow();
    const uploadLogsIndex = workflow.indexOf("- name: Upload E2E logs");
    const uploadLogsBlock = workflow.slice(uploadLogsIndex);

    expect(uploadLogsIndex).toBeGreaterThan(-1);
    expect(uploadLogsBlock).toContain("if: failure()");
    expect(uploadLogsBlock).toContain("continue-on-error: true");
  });
});
