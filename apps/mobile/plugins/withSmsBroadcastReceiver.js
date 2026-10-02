/**
 * Expo Config Plugin: withSmsBroadcastReceiver
 *
 * Injects native Android components for unified SMS detection into the
 * Android project during `expo prebuild`.
 *
 * Components generated:
 * 1. SmsBroadcastReceiver.kt — catches SMS_RECEIVED intents in all app states
 * 2. SmsHeadlessTaskService.kt — bridges SMS to JS when app is backgrounded
 *    or killed
 * 3. SmsEventModule.kt — React Native native module that emits events to JS
 *    via DeviceEventEmitter when the app is foregrounded
 *
 * Architecture:
 * - App foregrounded: BroadcastReceiver → SmsEventModule → DeviceEventEmitter → JS
 * - App backgrounded/killed: BroadcastReceiver → HeadlessJS → JS
 *
 * This ensures all changes survive `expo prebuild --clean`.
 *
 * Usage in app.json:
 *   "plugins": ["./plugins/withSmsBroadcastReceiver"]
 */

const {
  withDangerousMod,
  withAndroidManifest,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Kotlin source templates
// ---------------------------------------------------------------------------

/**
 * SmsEventModule — React Native Native Module
 *
 * Provides a bridge from native BroadcastReceiver → JS via DeviceEventEmitter.
 * When the app is foregrounded, the BroadcastReceiver calls
 * SmsEventModule.emitSmsReceived() which sends the event to JS.
 */
const SMS_EVENT_MODULE_KT = `package {{PACKAGE_NAME}}

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Native module that emits SMS events to JavaScript via DeviceEventEmitter.
 *
 * Used by SmsBroadcastReceiver when the app is foregrounded to deliver SMS
 * data to the JS listener without HeadlessJS.
 */
class SmsEventModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun getPermissionStatus(permission: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve("granted")
                return
            }

            val isGranted = reactApplicationContext.checkSelfPermission(permission) ==
                PackageManager.PERMISSION_GRANTED

            if (isGranted) {
                promise.resolve("granted")
                return
            }

            val wasRequested = reactApplicationContext
                .getSharedPreferences(PERMISSION_PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(requestedPreferenceKey(permission), false)
            val canShowNativePrompt =
                !wasRequested ||
                    getCurrentActivity()?.shouldShowRequestPermissionRationale(permission) == true

            promise.resolve(if (canShowNativePrompt) "requestable" else "blocked")
        } catch (error: Exception) {
            promise.reject("permission_status_failed", error)
        }
    }

    @ReactMethod
    fun markPermissionRequested(permission: String, promise: Promise) {
        try {
            reactApplicationContext
                .getSharedPreferences(PERMISSION_PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(requestedPreferenceKey(permission), true)
                .apply()
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("permission_mark_failed", error)
        }
    }

    @ReactMethod
    fun setListenerReady(isReady: Boolean, promise: Promise) {
        try {
            setJsListenerReady(isReady)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("listener_ready_failed", error)
        }
    }

    companion object {
        const val MODULE_NAME = "SmsEventModule"
        const val EVENT_NAME = "onSmsReceived"
        private const val PERMISSION_PREFS_NAME = "sms_permission_state"

        private var reactContextRef: ReactApplicationContext? = null
        @Volatile
        private var hasJsListener = false

        private fun requestedPreferenceKey(permission: String): String =
            "requested_$permission"

        /**
         * Store a reference to the ReactApplicationContext so the
         * BroadcastReceiver can emit events even without a direct
         * reference to this module instance.
         */
        fun setReactContext(context: ReactApplicationContext) {
            reactContextRef = context
        }

        fun setJsListenerReady(isReady: Boolean) {
            hasJsListener = isReady
        }

        /**
         * Emit an SMS event to JavaScript. Called by SmsBroadcastReceiver
         * when the app is foregrounded.
         *
         * @return true if event was emitted, false if no React context available
         */
        fun emitSmsReceived(sender: String, body: String, timestamp: Double): Boolean {
            val context = reactContextRef ?: return false
            if (!context.hasActiveReactInstance()) return false
            if (!hasJsListener) return false

            return try {
                val params = Arguments.createMap().apply {
                    putString("sender", sender)
                    putString("body", body)
                    putDouble("timestamp", timestamp)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_NAME, params)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun initialize() {
        super.initialize()
        setReactContext(reactApplicationContext)
    }

    override fun invalidate() {
        super.invalidate()
        if (reactContextRef === reactApplicationContext) {
            reactContextRef = null
        }
    }
}
`;

/**
 * SmsEventPackage — React Native Package registration
 *
 * Registers SmsEventModule so React Native discovers it at startup.
 */
const SMS_EVENT_PACKAGE_KT = `package {{PACKAGE_NAME}}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Package that registers SmsEventModule with the React Native bridge.
 */
class SmsEventPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(SmsEventModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

/**
 * SmsBroadcastReceiver — catches SMS_RECEIVED in all app states.
 *
 * Strategy:
 * 1. Emit via SmsEventModule (DeviceEventEmitter) when app is foregrounded
 * 2. Use HeadlessJS via SmsHeadlessTaskService when app is backgrounded/killed
 */
const APP_FOREGROUND_TRACKER_KT = `package {{PACKAGE_NAME}}

import android.app.Activity
import android.app.Application
import android.os.Bundle
import java.util.concurrent.atomic.AtomicInteger

/**
 * Tracks whether at least one app Activity is visible to the user.
 *
 * BroadcastReceiver foreground checks via ActivityManager are unreliable under
 * React Native New Architecture/dev-client because HeadlessJS can briefly alter
 * process importance while the Activity is still focused.
 */
object MonyviAppForegroundTracker : Application.ActivityLifecycleCallbacks {
    private val startedActivityCount = AtomicInteger(0)

    @Volatile
    private var isRegistered = false

    @Volatile
    var isForeground: Boolean = false
        private set

    fun register(application: Application) {
        if (isRegistered) {
            return
        }

        synchronized(this) {
            if (isRegistered) {
                return
            }

            application.registerActivityLifecycleCallbacks(this)
            isRegistered = true
        }
    }

    override fun onActivityStarted(activity: Activity) {
        startedActivityCount.incrementAndGet()
        isForeground = true
    }

    override fun onActivityStopped(activity: Activity) {
        val remaining = startedActivityCount.decrementAndGet()
        if (remaining <= 0) {
            startedActivityCount.set(0)
            isForeground = false
        }
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
`;

const BROADCAST_RECEIVER_KT = `package {{PACKAGE_NAME}}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * Native Android BroadcastReceiver for SMS_RECEIVED intents.
 *
 * Unified handler for all app states:
 * - App foregrounded: emits via SmsEventModule → DeviceEventEmitter → JS
 * - App backgrounded/killed: starts HeadlessJS via SmsHeadlessTaskService
 */
class SmsBroadcastReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsBroadcastReceiver"
        private const val TASK_KEY_SENDER = "sender"
        private const val TASK_KEY_BODY = "body"
        private const val TASK_KEY_TIMESTAMP = "timestamp"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) {
            Log.w(TAG, "No SMS messages in intent")
            return
        }

        // Combine multi-part SMS messages
        val sender = messages[0].displayOriginatingAddress ?: "Unknown"
        val body = messages.joinToString("") { it.messageBody ?: "" }
        val timestamp = messages[0].timestampMillis

        Log.d(TAG, "SMS received")

        if (MonyviAppForegroundTracker.isForeground) {
            val emitted = SmsEventModule.emitSmsReceived(sender, body, timestamp.toDouble())
            if (emitted) {
                Log.d(TAG, "SMS forwarded via DeviceEventEmitter")
                return
            }
        }

        Log.d(TAG, "No foreground JS listener, starting HeadlessJS task")
        startHeadlessTask(context, sender, body, timestamp)
    }

    private fun startHeadlessTask(
        context: Context,
        sender: String,
        body: String,
        timestamp: Long
    ) {
        val taskData = Bundle().apply {
            putString(TASK_KEY_SENDER, sender)
            putString(TASK_KEY_BODY, body)
            putDouble(TASK_KEY_TIMESTAMP, timestamp.toDouble())
        }

        val serviceIntent = Intent(context, SmsHeadlessTaskService::class.java).apply {
            putExtras(taskData)
        }

        try {
            context.startService(serviceIntent)
            HeadlessJsTaskService.acquireWakeLockNow(context)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start HeadlessJS service", e)
        }
    }
}
`;

const HEADLESS_TASK_SERVICE_KT = `package {{PACKAGE_NAME}}

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.LinearCountingRetryPolicy

/**
 * HeadlessJS Task Service for background SMS processing.
 *
 * Started by SmsBroadcastReceiver when an SMS is received while the app is not
 * foregrounded. Bridges the SMS data to the JavaScript
 * "SmsDetectionTask" registered via AppRegistry.registerHeadlessTask.
 */
class SmsHeadlessTaskService : HeadlessJsTaskService() {

    companion object {
        private const val TASK_NAME = "SmsDetectionTask"
        private const val TASK_TIMEOUT_MS = 120000L
        private const val TASK_RETRY_ATTEMPTS = 3
        private const val TASK_RETRY_DELAY_MS = 10000
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras: Bundle = intent?.extras ?: return null

        val sender = extras.getString("sender") ?: return null
        val body = extras.getString("body") ?: return null
        val timestamp = extras.getDouble("timestamp")

        val data = Arguments.createMap().apply {
            putString("sender", sender)
            putString("body", body)
            putDouble("timestamp", timestamp)
        }

        return HeadlessJsTaskConfig(
            TASK_NAME,
            data,
            TASK_TIMEOUT_MS,
            true,
            LinearCountingRetryPolicy(TASK_RETRY_ATTEMPTS, TASK_RETRY_DELAY_MS)
        )
    }
}
`;

// ---------------------------------------------------------------------------
// Plugin: Write Kotlin source files
// ---------------------------------------------------------------------------

/**
 * Writes all Kotlin source files into the Android project's package directory.
 */
function withKotlinSourceFiles(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const packageName = modConfig.android?.package || "com.monyvi.app";
      const packagePath = packageName.replace(/\./g, "/");

      const sourceDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath
      );

      // Ensure directory exists
      fs.mkdirSync(sourceDir, { recursive: true });

      // Template files and their content
      const kotlinFiles = [
        { name: "SmsBroadcastReceiver.kt", content: BROADCAST_RECEIVER_KT },
        {
          name: "MonyviAppForegroundTracker.kt",
          content: APP_FOREGROUND_TRACKER_KT,
        },
        {
          name: "SmsHeadlessTaskService.kt",
          content: HEADLESS_TASK_SERVICE_KT,
        },
        { name: "SmsEventModule.kt", content: SMS_EVENT_MODULE_KT },
        { name: "SmsEventPackage.kt", content: SMS_EVENT_PACKAGE_KT },
      ];

      for (const file of kotlinFiles) {
        const fileContent = file.content.replace(
          /\{\{PACKAGE_NAME\}\}/g,
          packageName
        );
        fs.writeFileSync(path.join(sourceDir, file.name), fileContent, "utf-8");
      }

      return modConfig;
    },
  ]);
}

// ---------------------------------------------------------------------------
// Plugin: Register SmsEventPackage in MainApplication
// ---------------------------------------------------------------------------

/**
 * Adds the SmsEventPackage to MainApplication.kt's getPackages() list.
 * This is needed so React Native discovers the SmsEventModule at startup.
 *
 * Regex patterns are CRLF-tolerant (\r?\n) so they work on both Unix
 * and Windows line endings.
 */
function withSmsEventPackageRegistration(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const packageName = modConfig.android?.package || "com.monyvi.app";
      const packagePath = packageName.replace(/\./g, "/");

      const mainApplicationPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath,
        "MainApplication.kt"
      );

      if (!fs.existsSync(mainApplicationPath)) {
        throw new Error(
          `[withSmsBroadcastReceiver] MainApplication.kt not found at ${mainApplicationPath}`
        );
      }

      let content = fs.readFileSync(mainApplicationPath, "utf-8");

      // Detect the line ending used in the file
      const eol = content.includes("\r\n") ? "\r\n" : "\n";

      // Find the getPackages() method and add SmsEventPackage to the list.
      // CRLF-tolerant patterns: use \r?\n to match either LF or CRLF.

      // Expo SDK 55+ style: PackageList(this).packages.apply { ... }
      const reactHostApplyPattern =
        /(PackageList\(this\)\.packages\.apply\s*\{\r?\n)/;

      // Expo SDK 52+ style: val packages = PackageList(this).packages
      const newStylePattern =
        /val packages = PackageList\(this\)\.packages\r?\n/;

      // Older Expo style: override fun getPackages() ... return PackageList(this).packages
      const oldStylePattern =
        /override fun getPackages\(\): List<ReactPackage>\s*\{[\s\S]*?return PackageList\(this\)\.packages/;

      if (
        !content.includes("SmsEventPackage") &&
        reactHostApplyPattern.test(content)
      ) {
        content = content.replace(
          reactHostApplyPattern,
          (match) =>
            `${match}          add(${packageName}.SmsEventPackage())${eol}`
        );
      } else if (
        !content.includes("SmsEventPackage") &&
        newStylePattern.test(content)
      ) {
        // Expo SDK 52+ style: insert add() after the val declaration
        content = content.replace(
          newStylePattern,
          (match) =>
            `${match}            packages.add(${packageName}.SmsEventPackage())${eol}`
        );
      } else if (
        !content.includes("SmsEventPackage") &&
        oldStylePattern.test(content)
      ) {
        // Older Expo style: inline return
        content = content.replace(
          oldStylePattern,
          (match) =>
            `${match}.apply {${eol}              add(${packageName}.SmsEventPackage())${eol}            }`
        );
      } else if (!content.includes("SmsEventPackage")) {
        throw new Error(
          "[withSmsBroadcastReceiver] Could not find PackageList pattern in MainApplication.kt"
        );
      }

      if (!content.includes("MonyviAppForegroundTracker.register(this)")) {
        const onCreatePattern = /(\s+super\.onCreate\(\)\r?\n)/;
        if (!onCreatePattern.test(content)) {
          throw new Error(
            "[withSmsBroadcastReceiver] Could not inject MonyviAppForegroundTracker.register(this) into MainApplication.kt"
          );
        }
        content = content.replace(
          onCreatePattern,
          (match) =>
            `${match}    ${packageName}.MonyviAppForegroundTracker.register(this)${eol}`
        );
      }

      fs.writeFileSync(mainApplicationPath, content, "utf-8");

      return modConfig;
    },
  ]);
}

// ---------------------------------------------------------------------------
// Plugin: Modify AndroidManifest.xml
// ---------------------------------------------------------------------------

/**
 * Adds RECEIVE_SMS permission and registers the BroadcastReceiver +
 * HeadlessTaskService in the AndroidManifest.
 */
function withSmsManifestChanges(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const packageName = modConfig.android?.package || "com.monyvi.app";

    // --- Add RECEIVE_SMS permission ---
    const permissions = manifest["uses-permission"] || [];
    const hasReceiveSms = permissions.some(
      (p) => p.$?.["android:name"] === "android.permission.RECEIVE_SMS"
    );

    if (!hasReceiveSms) {
      permissions.push({
        $: { "android:name": "android.permission.RECEIVE_SMS" },
      });
      manifest["uses-permission"] = permissions;
    }

    // --- Register BroadcastReceiver and Service ---
    const application = manifest.application?.[0];
    if (!application) {
      return modConfig;
    }

    // Check if receiver already registered
    const receivers = application.receiver || [];
    const hasReceiver = receivers.some(
      (r) =>
        r.$?.["android:name"] === `.SmsBroadcastReceiver` ||
        r.$?.["android:name"] === `${packageName}.SmsBroadcastReceiver`
    );

    if (!hasReceiver) {
      receivers.push({
        $: {
          "android:name": ".SmsBroadcastReceiver",
          "android:exported": "true",
          "android:permission": "android.permission.BROADCAST_SMS",
        },
        "intent-filter": [
          {
            $: { "android:priority": "999" },
            action: [
              {
                $: {
                  "android:name": "android.provider.Telephony.SMS_RECEIVED",
                },
              },
            ],
          },
        ],
      });
      application.receiver = receivers;
    }

    // Check if service already registered
    const services = application.service || [];
    const hasService = services.some(
      (s) =>
        s.$?.["android:name"] === `.SmsHeadlessTaskService` ||
        s.$?.["android:name"] === `${packageName}.SmsHeadlessTaskService`
    );

    if (!hasService) {
      services.push({
        $: {
          "android:name": ".SmsHeadlessTaskService",
          "android:exported": "false",
        },
      });
      application.service = services;
    }

    return modConfig;
  });
}

// ---------------------------------------------------------------------------
// Main plugin export
// ---------------------------------------------------------------------------

/**
 * Combined plugin that sets up all native Android components for
 * unified SMS detection (foreground + background + killed).
 */
function withSmsBroadcastReceiver(config) {
  config = withKotlinSourceFiles(config);
  config = withSmsEventPackageRegistration(config);
  config = withSmsManifestChanges(config);
  return config;
}

module.exports = withSmsBroadcastReceiver;
