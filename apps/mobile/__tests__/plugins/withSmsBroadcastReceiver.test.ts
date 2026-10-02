import fs from "fs";
import os from "os";
import path from "path";

interface AndroidManifestNode {
  readonly $?: Record<string, string>;
  readonly action?: AndroidManifestNode[];
  readonly "intent-filter"?: AndroidManifestNode[];
}

interface AndroidApplicationNode {
  receiver?: AndroidManifestNode[];
  service?: AndroidManifestNode[];
}

interface AndroidManifest {
  "uses-permission": AndroidManifestNode[];
  application: AndroidApplicationNode[];
}

interface PluginConfig {
  android: { package: string };
  modRequest: { platformProjectRoot: string };
  modResults: { manifest: AndroidManifest };
}

type ConfigPlugin = (config: PluginConfig) => PluginConfig;

jest.mock("expo/config-plugins", () => ({
  withAndroidManifest: jest.fn(
    (config: PluginConfig, action: (config: PluginConfig) => PluginConfig) =>
      action(config)
  ),
  withDangerousMod: jest.fn(
    (
      config: PluginConfig,
      [, action]: ["android", (config: PluginConfig) => PluginConfig]
    ) => action(config)
  ),
}));

const withSmsBroadcastReceiver =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../plugins/withSmsBroadcastReceiver") as ConfigPlugin;

const packageName = "com.monyvi.app";
const packagePath = packageName.replace(/\./g, "/");

function createMainApplication(projectRoot: string): string {
  const sourceDir = path.join(
    projectRoot,
    "app",
    "src",
    "main",
    "java",
    packagePath
  );
  fs.mkdirSync(sourceDir, { recursive: true });

  const mainApplicationPath = path.join(sourceDir, "MainApplication.kt");
  fs.writeFileSync(
    mainApplicationPath,
    `package ${packageName}

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here.
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
`,
    "utf8"
  );

  return mainApplicationPath;
}

function createConfig(projectRoot: string): PluginConfig {
  return {
    android: { package: packageName },
    modRequest: { platformProjectRoot: projectRoot },
    modResults: {
      manifest: {
        "uses-permission": [],
        application: [{}],
      },
    },
  };
}

describe("withSmsBroadcastReceiver", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "with-sms-broadcast-receiver-")
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("generates native SMS files and wires MainApplication plus manifest entries", () => {
    const mainApplicationPath = createMainApplication(projectRoot);

    const config = withSmsBroadcastReceiver(createConfig(projectRoot));

    const sourceDir = path.join(
      projectRoot,
      "app",
      "src",
      "main",
      "java",
      packagePath
    );
    const receiverSource = fs.readFileSync(
      path.join(sourceDir, "SmsBroadcastReceiver.kt"),
      "utf8"
    );
    const foregroundTracker = fs.readFileSync(
      path.join(sourceDir, "MonyviAppForegroundTracker.kt"),
      "utf8"
    );
    const headlessService = fs.readFileSync(
      path.join(sourceDir, "SmsHeadlessTaskService.kt"),
      "utf8"
    );
    const mainApplication = fs.readFileSync(mainApplicationPath, "utf8");

    expect(receiverSource).toContain("package com.monyvi.app");
    expect(receiverSource).toContain("MonyviAppForegroundTracker.isForeground");
    expect(receiverSource).toContain("SmsEventModule.emitSmsReceived");
    expect(receiverSource).toContain("SmsHeadlessTaskService::class.java");
    expect(receiverSource).not.toContain("ActivityManager");
    expect(foregroundTracker).toContain(
      "Application.ActivityLifecycleCallbacks"
    );
    expect(headlessService).toContain("private const val TASK_TIMEOUT_MS = 120000L");
    expect(headlessService).toContain("private const val TASK_RETRY_ATTEMPTS = 3");
    expect(headlessService).toContain("private const val TASK_RETRY_DELAY_MS = 10000");
    expect(mainApplication).toContain("add(com.monyvi.app.SmsEventPackage())");
    expect(mainApplication).toContain(
      "com.monyvi.app.MonyviAppForegroundTracker.register(this)"
    );

    const manifest = config.modResults.manifest;
    expect(manifest["uses-permission"]).toEqual(
      expect.arrayContaining([
        { $: { "android:name": "android.permission.RECEIVE_SMS" } },
      ])
    );
    const manifestReceiver = manifest.application[0].receiver?.find(
      (node) => node.$?.["android:name"] === ".SmsBroadcastReceiver"
    );
    const manifestService = manifest.application[0].service?.find(
      (node) => node.$?.["android:name"] === ".SmsHeadlessTaskService"
    );
    expect(manifestReceiver?.$).toMatchObject({
      "android:name": ".SmsBroadcastReceiver",
      "android:exported": "true",
      "android:permission": "android.permission.BROADCAST_SMS",
    });
    expect(manifestService?.$).toMatchObject({
      "android:name": ".SmsHeadlessTaskService",
      "android:exported": "false",
    });
  });

  it("does not duplicate MainApplication or manifest entries when run twice", () => {
    const mainApplicationPath = createMainApplication(projectRoot);
    const config = createConfig(projectRoot);

    withSmsBroadcastReceiver(config);
    const nextConfig = withSmsBroadcastReceiver(config);

    const mainApplication = fs.readFileSync(mainApplicationPath, "utf8");
    const manifest = nextConfig.modResults.manifest;

    expect(mainApplication.match(/SmsEventPackage/g)).toHaveLength(1);
    expect(
      mainApplication.match(/MonyviAppForegroundTracker\.register\(this\)/g)
    ).toHaveLength(1);
    expect(manifest["uses-permission"]).toHaveLength(1);
    expect(manifest.application[0].receiver).toHaveLength(1);
    expect(manifest.application[0].service).toHaveLength(1);
  });

  it("fails fast when MainApplication.kt is missing", () => {
    expect(() => withSmsBroadcastReceiver(createConfig(projectRoot))).toThrow(
      "MainApplication.kt not found"
    );
  });

  it("fails fast when foreground tracker registration cannot be injected", () => {
    const mainApplicationPath = createMainApplication(projectRoot);
    fs.writeFileSync(
      mainApplicationPath,
      fs
        .readFileSync(mainApplicationPath, "utf8")
        .replace("    super.onCreate()\n", ""),
      "utf8"
    );

    expect(() => withSmsBroadcastReceiver(createConfig(projectRoot))).toThrow(
      "Could not inject MonyviAppForegroundTracker.register(this)"
    );
  });
});
