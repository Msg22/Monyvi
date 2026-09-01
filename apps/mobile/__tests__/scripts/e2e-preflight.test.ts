interface E2ePreflightModule {
  applyE2eFixtureRuntimeSettings(
    env: Readonly<Record<string, string | undefined>>,
    dependencies: {
      clearLocalState: () => void;
      forceStop: () => void;
      runAdb: (args: readonly string[]) => void;
      seedTheme: (theme: string) => void;
    }
  ): void;
  appendAndroidPlatform(url: string): string;
  buildDevClientUrl(url: string): string;
  buildDevMenuPreferencesXml(): string;
  buildIntroSeenFlagSql(): string;
  buildE2eRuntimeStorageSql(theme: string): string;
  buildMetalsLocalFixtureCleanupSql(userId: string): string;
  buildMetalsLocalObservationCleanupSql(): string;
  currentFocusShowsDevLauncherError(currentFocus: string): boolean;
  currentFocusShowsDevMenu(currentFocus: string): boolean;
  currentFocusShowsLauncher(currentFocus: string): boolean;
  didDumpUiHierarchy(dumpOutput: string): boolean;
  getHttpClientNameForUrl(url: string): "http" | "https";
  resolveE2eFixtureRuntimeSettings(
    env?: Readonly<Record<string, string | undefined>>
  ): {
    locale: string;
    persistenceState: string;
    rateState: string;
    theme: string;
    textScale: number;
  } | null;
  assertMetalsFixtureBuildSupported(
    env?: Readonly<Record<string, string | undefined>>
  ): void;
  relaunchE2eFixtureIfRequired(
    settings: {
      locale: string;
      persistenceState: string;
      rateState: string;
      theme: string;
      textScale: number;
    } | null,
    dependencies: {
      forceStop: () => void;
      startApp: () => void;
      waitForReady: () => void;
      waitForSync: () => void;
    }
  ): void;
  getMaestroDeviceArgs(
    env?: Readonly<Record<string, string | undefined>>
  ): readonly string[];
  resolveAndroidDeviceId(
    env?: Readonly<Record<string, string | undefined>>
  ): string;
  isAppReady(uiXml: string): boolean;
  isNativeRootMounted(uiXml: string): boolean;
  isMissingDeviceSqliteError(output: string): boolean;
  isRetryableMaestroTransportFailure(output: string): boolean;
  androidDeviceReconnectTimeoutMs: number;
  shouldRestoreFromDevLauncher(uiXml: string, currentFocus: string): boolean;
  resolveMetroUrls(env?: Readonly<Record<string, string | undefined>>): {
    hostMetroUrl: string;
    metroUrl: string;
  };
  shouldRetryDevLauncherWithLoopback(
    currentFocus: string,
    deviceMetroUrl: string,
    hasRetried: boolean
  ): boolean;
  shouldRetryUnreadyNativeRootWithLoopback(
    uiXml: string,
    deviceMetroUrl: string,
    hasRetried: boolean,
    nativeRootWaitMs: number
  ): boolean;
  toLoopbackMetroUrl(deviceMetroUrl: string): string;
}

const preflight = jest.requireActual(
  "../../scripts/e2e-preflight"
) as E2ePreflightModule;

describe("e2e-preflight", () => {
  it("forces Android platform in Metro URLs", () => {
    expect(
      preflight.appendAndroidPlatform(
        "http://127.0.0.1:8081/status?platform=ios"
      )
    ).toBe("http://127.0.0.1:8081/status?platform=android");
  });

  it("uses the HTTPS client for HTTPS Metro endpoints", () => {
    expect(
      preflight.getHttpClientNameForUrl("https://metro.example/status")
    ).toBe("https");
    expect(
      preflight.getHttpClientNameForUrl("http://127.0.0.1:8081/status")
    ).toBe("http");
  });

  it("uses the emulator host Metro URL in CI to avoid adb reverse drops", () => {
    expect(preflight.resolveMetroUrls({ CI: "true" })).toEqual({
      hostMetroUrl: "http://127.0.0.1:8081",
      metroUrl: "http://10.0.2.2:8081/?platform=android",
    });

    expect(
      preflight.resolveMetroUrls({
        CI: "true",
        E2E_DEVICE_METRO_URL: "http://custom-device:8081",
      }).metroUrl
    ).toBe("http://custom-device:8081/?platform=android");
  });

  it("waits long enough for ADB reconnects after emulator transport drops", () => {
    expect(preflight.androidDeviceReconnectTimeoutMs).toBe(180000);
  });

  it("builds the Monyvi dev-client URL with the app scheme", () => {
    expect(
      preflight.buildDevClientUrl("http://10.0.2.2:8081/?platform=android")
    ).toBe(
      "monyvi://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%2F%3Fplatform%3Dandroid"
    );
  });

  it("recognizes the Expo development launcher error activity", () => {
    expect(
      preflight.currentFocusShowsDevLauncherError(
        "mCurrentFocus=Window{7d940e6 u0 com.monyvi.app/expo.modules.devlauncher.launcher.errors.DevLauncherErrorActivity}"
      )
    ).toBe(true);
    expect(
      preflight.currentFocusShowsDevLauncherError(
        "mCurrentFocus=Window{31b944f u0 com.monyvi.app/com.monyvi.app.MainActivity}"
      )
    ).toBe(false);
  });

  it("falls back to adb-reverse loopback once after a CI host-alias launch error", () => {
    const errorFocus =
      "mCurrentFocus=Window{7d940e6 u0 com.monyvi.app/expo.modules.devlauncher.launcher.errors.DevLauncherErrorActivity}";
    const hostAliasUrl = "http://10.0.2.2:8081/?platform=android";

    expect(
      preflight.shouldRetryDevLauncherWithLoopback(
        errorFocus,
        hostAliasUrl,
        false
      )
    ).toBe(true);
    expect(preflight.toLoopbackMetroUrl(hostAliasUrl)).toBe(
      "http://127.0.0.1:8081/?platform=android"
    );
    expect(
      preflight.shouldRetryDevLauncherWithLoopback(
        errorFocus,
        hostAliasUrl,
        true
      )
    ).toBe(false);
    expect(
      preflight.shouldRetryDevLauncherWithLoopback(
        errorFocus,
        "http://127.0.0.1:8081/?platform=android",
        false
      )
    ).toBe(false);
  });

  it("falls back once when a mounted native root never reaches product UI", () => {
    const nativeRootOnlyXml = `
      <hierarchy>
        <node package="com.monyvi.app" class="android.view.View" />
      </hierarchy>
    `;
    const hostAliasUrl = "http://10.0.2.2:8081/?platform=android";

    expect(
      preflight.shouldRetryUnreadyNativeRootWithLoopback(
        nativeRootOnlyXml,
        hostAliasUrl,
        false,
        14_999
      )
    ).toBe(false);
    expect(
      preflight.shouldRetryUnreadyNativeRootWithLoopback(
        nativeRootOnlyXml,
        hostAliasUrl,
        false,
        15_000
      )
    ).toBe(true);
    expect(
      preflight.shouldRetryUnreadyNativeRootWithLoopback(
        '<node text="Skip" />',
        hostAliasUrl,
        false,
        15_000
      )
    ).toBe(false);
    expect(
      preflight.shouldRetryUnreadyNativeRootWithLoopback(
        nativeRootOnlyXml,
        hostAliasUrl,
        true,
        15_000
      )
    ).toBe(false);
  });

  it("builds dev menu preferences that hide the Expo tools button", () => {
    expect(preflight.buildDevMenuPreferencesXml()).toContain(
      '<boolean name="showFab" value="false" />'
    );
    expect(preflight.buildDevMenuPreferencesXml()).toContain(
      '<boolean name="isOnboardingFinished" value="true" />'
    );
  });

  it("builds Maestro device args from explicit device env", () => {
    expect(
      preflight.getMaestroDeviceArgs({
        ANDROID_SERIAL: "adb-device",
        MAESTRO_DEVICE_ID: "maestro-device",
      })
    ).toEqual(["--device", "maestro-device"]);
    expect(
      preflight.getMaestroDeviceArgs({
        ANDROID_SERIAL: "adb-device",
      })
    ).toEqual(["--device", "adb-device"]);
    expect(preflight.getMaestroDeviceArgs({})).toEqual([]);
  });

  it("uses the same environment precedence for adb and Maestro", () => {
    const env = {
      ANDROID_SERIAL: "adb-device",
      DEVICE: "device-env",
      MAESTRO_DEVICE_ID: "maestro-device",
    };

    expect(preflight.resolveAndroidDeviceId(env)).toBe("maestro-device");
    expect(preflight.getMaestroDeviceArgs(env)).toEqual([
      "--device",
      "maestro-device",
    ]);
    expect(
      preflight.resolveAndroidDeviceId({ DEVICE: "physical-device" })
    ).toBe("physical-device");
    expect(preflight.resolveAndroidDeviceId({})).toBe("emulator-5554");
  });

  it("builds AsyncStorage SQL that skips pitch screens after pm clear", () => {
    const sql = preflight.buildIntroSeenFlagSql();

    expect(sql).toContain("create table if not exists catalystLocalStorage");
    expect(sql).toContain("'@monyvi/intro-seen'");
    expect(sql).toContain("'true'");
    expect(sql).toContain("insert or replace");
  });

  it("applies Metals locale, theme, and text scale through executable runtime boundaries", () => {
    const runtimeSettings = preflight.resolveE2eFixtureRuntimeSettings({
      E2E_METALS_PROFILE: "metals-stale-restart-ar-dark",
    });
    expect(runtimeSettings).toEqual({
      locale: "ar",
      persistenceState: "restart",
      rateState: "stale",
      theme: "dark",
      textScale: 2,
    });
    expect(preflight.buildE2eRuntimeStorageSql("dark")).toContain(
      "'monyvi_theme_mode', 'dark'"
    );

    const clearLocalState = jest.fn();
    const forceStop = jest.fn();
    const runAdb = jest.fn();
    const seedTheme = jest.fn();
    preflight.applyE2eFixtureRuntimeSettings(
      { E2E_METALS_PROFILE: "metals-stale-restart-ar-dark" },
      { clearLocalState, forceStop, runAdb, seedTheme }
    );

    expect(forceStop).toHaveBeenCalledTimes(1);
    expect(clearLocalState).toHaveBeenCalledTimes(1);
    expect(runAdb).toHaveBeenCalledWith([
      "shell",
      "settings",
      "put",
      "system",
      "font_scale",
      "2",
    ]);
    expect(seedTheme).toHaveBeenCalledWith("dark");
  });

  it("resets Android font scale for a non-Metals preflight", () => {
    const clearLocalState = jest.fn();
    const forceStop = jest.fn();
    const runAdb = jest.fn();
    const seedTheme = jest.fn();

    preflight.applyE2eFixtureRuntimeSettings(
      {},
      { clearLocalState, forceStop, runAdb, seedTheme }
    );

    expect(runAdb).toHaveBeenCalledWith([
      "shell",
      "settings",
      "put",
      "system",
      "font_scale",
      "1",
    ]);
    expect(forceStop).not.toHaveBeenCalled();
    expect(clearLocalState).not.toHaveBeenCalled();
    expect(seedTheme).not.toHaveBeenCalled();
  });

  it("leaves shared non-Metals fixture profiles on the default preflight path", () => {
    const env = { E2E_FIXTURE_PROFILE: "dashboard-full" };
    expect(preflight.resolveE2eFixtureRuntimeSettings(env)).toBeNull();

    const clearLocalState = jest.fn();
    const forceStop = jest.fn();
    const runAdb = jest.fn();
    const seedTheme = jest.fn();
    preflight.applyE2eFixtureRuntimeSettings(env, {
      clearLocalState,
      forceStop,
      runAdb,
      seedTheme,
    });

    expect(runAdb).toHaveBeenCalledWith([
      "shell",
      "settings",
      "put",
      "system",
      "font_scale",
      "1",
    ]);
    expect(forceStop).not.toHaveBeenCalled();
    expect(clearLocalState).not.toHaveBeenCalled();
    expect(seedTheme).not.toHaveBeenCalled();
  });

  it("clears the pull-only observation cache before a Metals profile launch", () => {
    expect(preflight.buildMetalsLocalObservationCleanupSql()).toBe(
      'delete from "market_rate_observations" where "source" = \'e2e_fixture\';'
    );
  });

  it("clears only deterministic Metals fixture holdings, accounts, and dependent rows in FK-safe order", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const { buildSeedIds } = jest.requireActual(
      "../../scripts/seed-fixtures/seed-engine"
    ) as {
      buildSeedIds: (
        userId: string,
        seedScope: string
      ) => {
        accounts: Record<string, string>;
        accountSmsSenders: Record<string, string>;
        bankDetails: Record<string, string>;
        transactions: Record<string, string>;
        transfers: Record<string, string>;
      };
    };
    const ids = buildSeedIds(userId, "e2e-metals-fresh-local-en-light");
    const sql = preflight.buildMetalsLocalFixtureCleanupSql(userId);

    expect(sql).toContain(ids.transactions.expense);
    expect(sql).toContain(ids.transfers.atm);
    expect(sql).toContain(ids.accountSmsSenders.nbe);
    expect(sql).toContain(ids.bankDetails.nbe);
    expect(sql).toContain(ids.accounts.cash);
    expect(sql).not.toContain("user-account-that-must-survive");
    const holdingStateDelete = sql.indexOf(
      'delete from "metal_holding_states"'
    );
    const assetMetalDelete = sql.indexOf('delete from "asset_metals"');
    const assetDelete = sql.indexOf('delete from "assets"');
    expect(holdingStateDelete).toBeGreaterThanOrEqual(0);
    expect(assetMetalDelete).toBeGreaterThan(holdingStateDelete);
    expect(assetDelete).toBeGreaterThan(assetMetalDelete);
    const holdingStateStatement = sql
      .split("\n")
      .find((line) => line.startsWith('delete from "metal_holding_states"'));
    const assetStatement = sql
      .split("\n")
      .find((line) => line.startsWith('delete from "assets"'));
    expect(holdingStateStatement?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g)).toEqual(
      assetStatement?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g)
    );
    for (const table of ["metal_holding_states", "asset_metals", "assets"]) {
      const statement = sql
        .split("\n")
        .find((line) => line.startsWith(`delete from "${table}"`));
      expect(statement?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g)).toHaveLength(4);
      expect(statement).toContain('where "id" in (');
    }
    expect(sql.indexOf('delete from "transactions"')).toBeLessThan(
      sql.indexOf('delete from "accounts"')
    );
    expect(sql.indexOf('delete from "transfers"')).toBeLessThan(
      sql.indexOf('delete from "accounts"')
    );
    expect(sql).toContain(
      'delete from "market_rate_observations" where "source" = \'e2e_fixture\';'
    );
  });

  it("fails fast before attempting a Metals profile in a release build", () => {
    const releaseEnv = {
      E2E_METALS_PROFILE: "metals-fresh-local-en-light",
      E2E_RELEASE_BUILD: "1",
    };
    expect(() =>
      preflight.assertMetalsFixtureBuildSupported(releaseEnv)
    ).toThrow(
      "Metals E2E profiles are not supported in release builds until authenticated cleanup and readiness are available."
    );
    const clearLocalState = jest.fn();
    const forceStop = jest.fn();
    expect(() =>
      preflight.applyE2eFixtureRuntimeSettings(releaseEnv, {
        clearLocalState,
        forceStop,
        runAdb: jest.fn(),
        seedTheme: jest.fn(),
      })
    ).toThrow(
      "Metals E2E profiles are not supported in release builds until authenticated cleanup and readiness are available."
    );
    expect(forceStop).not.toHaveBeenCalled();
    expect(clearLocalState).not.toHaveBeenCalled();

    expect(() =>
      preflight.assertMetalsFixtureBuildSupported({ E2E_RELEASE_BUILD: "1" })
    ).not.toThrow();
    expect(() =>
      preflight.assertMetalsFixtureBuildSupported({
        E2E_FIXTURE_PROFILE: "some-other-profile",
        E2E_RELEASE_BUILD: "1",
      })
    ).not.toThrow();
  });

  it("waits for the seeded projection and relaunches restart profiles without clearing the database", () => {
    const events: string[] = [];
    preflight.relaunchE2eFixtureIfRequired(
      {
        locale: "ar",
        persistenceState: "restart",
        rateState: "stale",
        theme: "dark",
        textScale: 2,
      },
      {
        waitForSync: () => events.push("sync"),
        forceStop: () => events.push("stop"),
        startApp: () => events.push("start"),
        waitForReady: () => events.push("ready"),
      }
    );

    expect(events).toEqual(["sync", "stop", "start", "ready"]);
  });

  it("waits for every non-missing Metals rate before handing off to Maestro", () => {
    const freshEvents: string[] = [];
    preflight.relaunchE2eFixtureIfRequired(
      {
        locale: "en",
        persistenceState: "local",
        rateState: "fresh",
        theme: "light",
        textScale: 1,
      },
      {
        waitForSync: () => freshEvents.push("sync"),
        forceStop: () => freshEvents.push("stop"),
        startApp: () => freshEvents.push("start"),
        waitForReady: () => freshEvents.push("ready"),
      }
    );
    expect(freshEvents).toEqual(["sync"]);

    const missingEvents: string[] = [];
    preflight.relaunchE2eFixtureIfRequired(
      {
        locale: "ar",
        persistenceState: "local",
        rateState: "missing",
        theme: "light",
        textScale: 2,
      },
      {
        waitForSync: () => missingEvents.push("sync"),
        forceStop: () => missingEvents.push("stop"),
        startApp: () => missingEvents.push("start"),
        waitForReady: () => missingEvents.push("ready"),
      }
    );
    expect(missingEvents).toEqual([]);
  });

  it("detects Android devices without a sqlite3 shell binary", () => {
    expect(
      preflight.isMissingDeviceSqliteError(
        "run-as: exec failed for sqlite3: No such file or directory"
      )
    ).toBe(true);
    expect(preflight.isMissingDeviceSqliteError("")).toBe(false);
  });

  it("treats the pre-auth pitch carousel as loaded product UI", () => {
    expect(preflight.isAppReady('<node text="Skip" />')).toBe(true);
    expect(preflight.isAppReady('<node text="Track with your voice." />')).toBe(
      true
    );
  });

  it("treats the SMS onboarding prompt as loaded product UI", () => {
    expect(
      preflight.isAppReady('<node text="Auto-Track Transactions" />')
    ).toBe(true);
  });

  it("does not treat the Expo developer menu as product UI", () => {
    expect(
      preflight.isAppReady(
        '<node text="This is the developer menu" /><node text="Skip" />'
      )
    ).toBe(false);
  });

  it("detects the mounted native Fabric root when UIAutomator hides React text", () => {
    const nativeRootOnlyXml = `
        <hierarchy>
          <node package="com.monyvi.app" class="androidx.compose.ui.platform.ComposeView">
            <node package="com.monyvi.app" class="android.view.View" />
          </node>
        </hierarchy>
      `;

    expect(preflight.isNativeRootMounted(nativeRootOnlyXml)).toBe(true);
    expect(preflight.isAppReady(nativeRootOnlyXml)).toBe(false);
  });

  it("rejects failed UIAutomator dumps so stale window XML is not reused", () => {
    expect(
      preflight.didDumpUiHierarchy("UI hierchary dumped to: /sdcard/window.xml")
    ).toBe(true);
    expect(preflight.didDumpUiHierarchy("ERROR: null root node returned")).toBe(
      false
    );
  });

  it("detects retryable Maestro view hierarchy transport failures", () => {
    expect(
      preflight.isRetryableMaestroTransportFailure(
        "viewHierarchy failed: io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException"
      )
    ).toBe(true);
    expect(
      preflight.isRetryableMaestroTransportFailure(
        "Maestro timed out while reading the Android view hierarchy"
      )
    ).toBe(true);
    expect(
      preflight.isRetryableMaestroTransportFailure(
        "Timed out while reading the Android view-hierarchy"
      )
    ).toBe(true);
    expect(
      preflight.isRetryableMaestroTransportFailure(
        'Assertion is false: "Transactions" is visible'
      )
    ).toBe(false);
  });

  it("does not treat stale DevMenuActivity records as the focused dev menu", () => {
    expect(
      preflight.currentFocusShowsDevMenu(`
        Display #0 currentFocus=Window{ad25cd0 u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}
        mFocusedApp=ActivityRecord{e4594ea u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity t10}
        Window #9 Window{b4ae2b7 u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity}
      `)
    ).toBe(false);
  });

  it("detects the developer menu when it owns the focused window", () => {
    expect(
      preflight.currentFocusShowsDevMenu(
        "mCurrentFocus=Window{b4ae2b7 u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity}"
      )
    ).toBe(true);
  });

  it("does not relaunch while the Expo dev launcher activity owns a loading splash", () => {
    const focus =
      "mCurrentFocus=Window{4a98ee6 u0 com.monyvi.app/expo.modules.devlauncher.launcher.DevLauncherActivity}";
    const uiXml =
      '<hierarchy><node package="com.monyvi.app" text="Monyvi" /></hierarchy>';

    expect(preflight.shouldRestoreFromDevLauncher(uiXml, focus)).toBe(false);
  });

  it("relaunches when the Expo development server picker is visible", () => {
    const focus =
      "mCurrentFocus=Window{4a98ee6 u0 com.monyvi.app/expo.modules.devlauncher.launcher.DevLauncherActivity}";
    const uiXml =
      '<hierarchy><node package="com.monyvi.app" text="Development servers" /></hierarchy>';

    expect(preflight.shouldRestoreFromDevLauncher(uiXml, focus)).toBe(true);
  });

  it("detects launcher focus even when stale dev menu records are present", () => {
    expect(
      preflight.currentFocusShowsLauncher(`
        Display #0 currentFocus=Window{ad25cd0 u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}
        focusedApp=ActivityRecord{4efef91 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t7}
        mFocusedApp=ActivityRecord{e4594ea u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity t10}
        Window #9 Window{b4ae2b7 u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity}
      `)
    ).toBe(true);
  });

  it("detects launcher ANR focus from dumpsys", () => {
    expect(
      preflight.currentFocusShowsLauncher(`
        WINDOW MANAGER WINDOWS (dumpsys window windows)
        mCurrentFocus=Window{c343781 u0 Application Not Responding: com.google.android.apps.nexuslauncher}
        mFocusedApp=ActivityRecord{e4594ea u0 com.monyvi.app/expo.modules.devmenu.DevMenuActivity t10}
      `)
    ).toBe(true);
  });

  it("ignores stale launcher focus from the last ANR section", () => {
    expect(
      preflight.currentFocusShowsLauncher(`
        WINDOW MANAGER LAST ANR (dumpsys window lastanr)
        Display #0 currentFocus=Window{e5ceca1 u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}
        WINDOW MANAGER WINDOWS (dumpsys window windows)
        mCurrentFocus=Window{31b944f u0 com.monyvi.app/com.monyvi.MainActivity}
      `)
    ).toBe(false);
  });

  it("detects current launcher focus after a stale last ANR section", () => {
    expect(
      preflight.currentFocusShowsLauncher(`
        WINDOW MANAGER LAST ANR (dumpsys window lastanr)
        Display #0 currentFocus=Window{31b944f u0 com.monyvi.app/com.monyvi.MainActivity}
        WINDOW MANAGER WINDOWS (dumpsys window windows)
        mCurrentFocus=Window{e5ceca1 u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}
      `)
    ).toBe(true);
  });
});
