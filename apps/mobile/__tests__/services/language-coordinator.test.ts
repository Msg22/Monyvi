import { createLanguageCoordinator } from "@/services/language-coordinator";

function createHarness(): {
  coordinator: ReturnType<typeof createLanguageCoordinator>;
  dependencies: Parameters<typeof createLanguageCoordinator>[0];
  reload: jest.Mock;
  translate: jest.Mock;
  markers: Map<string, string>;
} {
  const markers = new Map<string, string>();
  const reload = jest.fn().mockResolvedValue(undefined);
  const translate = jest.fn().mockResolvedValue(undefined);
  const dependencies = {
    translate,
    normalizeDirection: jest.fn(),
    needsReload: jest.fn((): boolean => true),
    reload,
    readMarker: jest.fn(
      (): Promise<string | null> =>
        Promise.resolve(markers.get("attempt") ?? null)
    ),
    writeMarker: jest.fn((value: string): Promise<void> => {
      markers.set("attempt", value);
      return Promise.resolve();
    }),
    clearMarker: jest.fn((): Promise<void> => {
      markers.delete("attempt");
      return Promise.resolve();
    }),
  };
  const coordinator = createLanguageCoordinator(dependencies);
  coordinator.setScope("user-a");
  return { coordinator, dependencies, reload, translate, markers };
}

describe("language coordination", (): void => {
  beforeEach((): void => {
    jest.useFakeTimers();
  });
  afterEach((): void => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("recovers when reload resolves without restarting the runtime", async (): Promise<void> => {
    const { coordinator } = createHarness();
    await coordinator.apply("en");
    jest.runOnlyPendingTimers();
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "error",
      errorCode: "restart-incomplete",
    });
  });
  it("persists before translation and reload and never marks reload as ready", async (): Promise<void> => {
    const { coordinator, reload, translate } = createHarness();
    const persist = jest.fn().mockResolvedValue(undefined);
    await coordinator.apply("en", { persist });
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      translate.mock.invocationCallOrder[0]
    );
    expect(translate.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]
    );
    expect(coordinator.getSnapshot().phase).toBe("restarting");
  });

  it("stops repeated automatic restarts but allows explicit retry", async (): Promise<void> => {
    const { coordinator, reload } = createHarness();
    await coordinator.apply("en");
    await expect(coordinator.apply("en")).rejects.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().errorCode).toBe("restart-incomplete");
    await coordinator.retry();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("keeps failed target and retries its persistence", async (): Promise<void> => {
    const { coordinator, reload } = createHarness();
    const persist = jest
      .fn()
      .mockRejectedValueOnce(new Error("storage"))
      .mockResolvedValue(undefined);
    await expect(coordinator.apply("ar", { persist })).rejects.toThrow(
      "storage"
    );
    expect(reload).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "error",
      language: "ar",
    });
    await coordinator.retry();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("deduplicates matching concurrent requests", async (): Promise<void> => {
    const { coordinator, reload } = createHarness();
    await Promise.all([coordinator.apply("ar"), coordinator.apply("ar")]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("invalidates pending work when account changes or signs out", async (): Promise<void> => {
    const { coordinator, translate, reload } = createHarness();
    let finish: (() => void) | undefined;
    const persist = (): Promise<void> =>
      new Promise((resolve): void => {
        finish = resolve;
      });
    const pending = coordinator.apply("ar", { persist });
    await Promise.resolve();
    coordinator.setScope(null);
    finish?.();
    await pending;
    expect(translate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().phase).toBe("resolving");
  });

  it("normalizes matching direction and clears restart marker", async (): Promise<void> => {
    const { coordinator, dependencies, markers, reload } = createHarness();
    jest.mocked(dependencies.needsReload).mockReturnValue(false);
    markers.set(
      "attempt",
      JSON.stringify({ scope: "user-a", language: "en" })
    );
    await coordinator.apply("en");
    expect(dependencies.normalizeDirection).toHaveBeenCalledWith("en");
    expect(markers.size).toBe(0);
    expect(reload).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().phase).toBe("ready");
  });

  it("lets the next account proceed while an old reload is hung", async (): Promise<void> => {
    const { coordinator, dependencies, reload } = createHarness();
    reload.mockImplementationOnce(
      (): Promise<void> => new Promise((): void => undefined)
    );
    const pending = coordinator.apply("ar");
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(coordinator.getSnapshot().phase).toBe("restarting");
    coordinator.setScope("user-b");
    jest.mocked(dependencies.needsReload).mockReturnValue(false);
    await coordinator.apply("en");
    await pending;
    expect(coordinator.getSnapshot()).toMatchObject({
      scope: "user-b",
      language: "en",
      phase: "ready",
    });
  });

  it("does not let a rejected reload's timer overwrite a later recovery", async (): Promise<void> => {
    const { coordinator, dependencies, reload } = createHarness();
    reload.mockRejectedValueOnce(new Error("reload rejected"));
    await expect(coordinator.apply("ar")).rejects.toThrow("reload rejected");
    jest.mocked(dependencies.needsReload).mockReturnValue(false);
    await coordinator.retry();
    jest.runOnlyPendingTimers();
    expect(coordinator.getSnapshot().phase).toBe("ready");
  });

  it("preempts automatic reconciliation so explicit selection persists before any reload", async (): Promise<void> => {
    const { coordinator, translate, reload } = createHarness();
    let finish: (() => void) | undefined;
    translate.mockImplementationOnce(
      (): Promise<void> =>
        new Promise((resolve): void => {
          finish = resolve;
        })
    );
    const automatic = coordinator.apply("ar");
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    const persist = jest.fn().mockResolvedValue(undefined);
    const selection = coordinator.apply("ar", { persist });
    expect(reload).not.toHaveBeenCalled();
    finish?.();
    await Promise.all([automatic, selection]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("drains an old translation before applying the next account", async (): Promise<void> => {
    const { coordinator, translate, dependencies } = createHarness();
    jest.mocked(dependencies.needsReload).mockReturnValue(false);
    let finish: (() => void) | undefined;
    translate.mockImplementationOnce(
      (): Promise<void> =>
        new Promise((resolve): void => {
          finish = resolve;
        })
    );
    const old = coordinator.apply("ar");
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    coordinator.setScope("user-b");
    const next = coordinator.apply("en");
    expect(translate).toHaveBeenCalledTimes(1);
    finish?.();
    await Promise.all([old, next]);
    expect(translate).toHaveBeenLastCalledWith("en");
    expect(coordinator.getSnapshot()).toMatchObject({
      scope: "user-b",
      language: "en",
      phase: "ready",
    });
  });

  it("retries reload when explicit selection passes persist even after restart-incomplete", async (): Promise<void> => {
    const { coordinator, reload, markers } = createHarness();
    const marker = JSON.stringify({ scope: "user-a", language: "ar" });
    markers.set("attempt", marker);

    // Without persist or retry, automatic reconciliation fails
    await expect(coordinator.apply("ar")).rejects.toThrow(
      "Language restart did not apply the requested direction"
    );
    expect(reload).not.toHaveBeenCalled();

    // With persist (explicit selection), it proceeds to reload again
    const persist = jest.fn().mockResolvedValue(undefined);
    await coordinator.apply("ar", { persist });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not clear a restart marker belonging to another scoped target when reload is not needed", async (): Promise<void> => {
    const { coordinator, dependencies, markers } = createHarness();
    const foreignMarker = JSON.stringify({ scope: "user-other", language: "ar" });
    markers.set("attempt", foreignMarker);

    jest.mocked(dependencies.needsReload).mockReturnValue(false);
    coordinator.setScope("user-b");
    await coordinator.apply("en");

    expect(markers.get("attempt")).toBe(foreignMarker);
    expect(dependencies.clearMarker).not.toHaveBeenCalled();
  });
});
