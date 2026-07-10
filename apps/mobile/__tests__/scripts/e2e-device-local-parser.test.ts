interface DeviceLocalParserModule {
  buildSmsSyncRunnerArgs(journeys?: readonly string[]): readonly string[];
  buildCommonEnv(
    device: string,
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Readonly<Record<string, string | undefined>>;
  buildMetroEnv(
    device: string,
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Readonly<Record<string, string | undefined>>;
  readAdbDevices(env?: Readonly<Record<string, string | undefined>>): string;
  parseAdbDevices(output: string): readonly string[];
}

const deviceLocalParser = jest.requireActual(
  "../../scripts/e2e-device-local-parser"
) as DeviceLocalParserModule;

describe("e2e-device-local-parser script helpers", () => {
  it("parses only online adb devices", () => {
    const devices = deviceLocalParser.parseAdbDevices(`List of devices attached
emulator-5554 offline
RZCWA1KBNVL device product:a54 model:SM_A546E
another unauthorized
`);

    expect(devices).toEqual(["RZCWA1KBNVL"]);
  });

  it("sets local-parser E2E device defaults", () => {
    const env = deviceLocalParser.buildCommonEnv("RZCWA1KBNVL", {});

    expect(env.ANDROID_SERIAL).toBe("RZCWA1KBNVL");
    expect(env.DEVICE).toBe("RZCWA1KBNVL");
    expect(env.MAESTRO_DEVICE_ID).toBe("RZCWA1KBNVL");
    expect(env.E2E_SUPABASE_MODE).toBe("local");
    expect(env.E2E_LOCAL_APP_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.EXPO_PUBLIC_MONYVI_TEST_MODE).toBe("e2e");
    expect(env.EXPO_PUBLIC_AI_SMS_PARSER_MODE).toBe("local");
  });

  it("clears Metro cache for local-parser device startup", () => {
    const env = deviceLocalParser.buildMetroEnv("RZCWA1KBNVL", {});

    expect(env.EXPO_PUBLIC_AI_SMS_PARSER_MODE).toBe("local");
    expect(env.E2E_METRO_CLEAR_CACHE).toBe("1");
  });

  it("runs the full SMS sync suite when no journey is provided", () => {
    expect(deviceLocalParser.buildSmsSyncRunnerArgs()).toEqual([
      "scripts/run-sms-sync-journeys.js",
    ]);
  });

  it("passes focused journey numbers through to the SMS sync runner", () => {
    expect(deviceLocalParser.buildSmsSyncRunnerArgs(["01", "02"])).toEqual([
      "scripts/run-sms-sync-journeys.js",
      "01",
      "02",
    ]);
  });

  it("restarts ADB once when device discovery times out", () => {
    jest.isolateModules(() => {
      const spawnSync = jest
        .fn()
        .mockReturnValueOnce({
          error: { code: "ETIMEDOUT", message: "spawnSync adb ETIMEDOUT" },
          status: null,
          stderr: "",
          stdout: "",
        })
        .mockReturnValueOnce({ error: undefined, status: 0 })
        .mockReturnValueOnce({ error: undefined, status: 0 })
        .mockReturnValueOnce({
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "List of devices attached\nRZCWA1KBNVL\tdevice\n",
        });

      jest.doMock("node:child_process", () => ({ spawnSync }));

      const isolatedModule =
        require("../../scripts/e2e-device-local-parser") as DeviceLocalParserModule;

      expect(
        isolatedModule.readAdbDevices({ E2E_ADB_DISCOVERY_TIMEOUT_MS: "1000" })
      ).toContain("RZCWA1KBNVL");
      expect(spawnSync).toHaveBeenNthCalledWith(
        1,
        "adb",
        ["devices"],
        expect.objectContaining({ timeout: 1000 })
      );
      expect(spawnSync).toHaveBeenNthCalledWith(
        2,
        "adb",
        ["kill-server"],
        expect.any(Object)
      );
      expect(spawnSync).toHaveBeenNthCalledWith(
        3,
        "adb",
        ["start-server"],
        expect.any(Object)
      );
      expect(spawnSync).toHaveBeenNthCalledWith(
        4,
        "adb",
        ["devices"],
        expect.objectContaining({ timeout: 1000 })
      );
    });
  });
});
