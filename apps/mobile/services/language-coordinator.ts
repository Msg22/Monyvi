import type { SupportedLanguage } from "@/i18n/translation-schema";

export interface LanguageSnapshot {
  readonly phase: "resolving" | "applying" | "restarting" | "ready" | "error";
  readonly scope: string | null;
  readonly language: SupportedLanguage | null;
  readonly errorCode:
    | "persistence-failed"
    | "translation-failed"
    | "direction-failed"
    | "restart-incomplete"
    | null;
}

interface LanguageDependencies {
  readonly translate: (language: SupportedLanguage) => Promise<unknown>;
  readonly normalizeDirection: (language: SupportedLanguage) => void;
  readonly needsReload: (language: SupportedLanguage) => boolean;
  readonly reload: () => Promise<void>;
  readonly readMarker: () => Promise<string | null>;
  readonly writeMarker: (marker: string) => Promise<void>;
  readonly clearMarker: () => Promise<void>;
}

interface ApplyOptions {
  readonly persist?: (isCurrent: () => boolean) => Promise<void>;
  readonly retry?: boolean;
}

export interface LanguageCoordinator {
  readonly getSnapshot: () => LanguageSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setScope: (scope: string | null) => void;
  readonly apply: (
    language: SupportedLanguage,
    options?: ApplyOptions
  ) => Promise<void>;
  readonly retry: () => Promise<void>;
}

const RESTART_GRACE_MS = 5000;

/** Serializes all language work; persistence is injected to avoid service cycles. */
export function createLanguageCoordinator(
  dependencies: LanguageDependencies
): LanguageCoordinator {
  let snapshot: LanguageSnapshot = {
    phase: "resolving",
    scope: null,
    language: null,
    errorCode: null,
  };
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();
  let active: {
    readonly key: string;
    readonly promise: Promise<void>;
    readonly persists: boolean;
  } | null = null;
  let lastRequest: {
    readonly language: SupportedLanguage;
    readonly options: ApplyOptions;
  } | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelRestartWait: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function publish(next: LanguageSnapshot): void {
    snapshot = next;
    listeners.forEach((listener): void => listener());
  }

  function clearRestartTimer(): void {
    if (restartTimer !== null) clearTimeout(restartTimer);
    restartTimer = null;
    cancelRestartWait?.();
    cancelRestartWait = null;
  }

  function setScope(scope: string | null): void {
    if (snapshot.scope === scope) return;
    generation += 1;
    active = null;
    lastRequest = null;
    clearRestartTimer();
    publish({ phase: "resolving", scope, language: null, errorCode: null });
  }

  async function perform(
    language: SupportedLanguage,
    options: ApplyOptions,
    epoch: number
  ): Promise<void> {
    const current = (): boolean => epoch === generation;
    if (!current()) return;
    clearRestartTimer();
    const scope = snapshot.scope;
    const marker = JSON.stringify({ scope, language });
    publish({ phase: "applying", scope, language, errorCode: null });
    let failureCode: LanguageSnapshot["errorCode"] = "persistence-failed";
    try {
      await options.persist?.(current);
      if (!current()) return;
      failureCode = "translation-failed";
      await dependencies.translate(language);
      if (!current()) return;
      failureCode = "direction-failed";
      dependencies.normalizeDirection(language);
      if (!dependencies.needsReload(language)) {
        await dependencies.clearMarker();
        if (current())
          publish({ phase: "ready", scope, language, errorCode: null });
        return;
      }
      const previous = await dependencies.readMarker();
      if (!current()) return;
      if (previous === marker && !options.retry) {
        publish({
          phase: "error",
          scope,
          language,
          errorCode: "restart-incomplete",
        });
        throw new Error(
          "Language restart did not apply the requested direction"
        );
      }
      await dependencies.writeMarker(marker);
      if (!current()) return;
      publish({ phase: "restarting", scope, language, errorCode: null });
      const restartTimeout = new Promise<never>((_resolve, reject): void => {
        cancelRestartWait = (): void =>
          reject(new Error("Language restart cancelled"));
        restartTimer = setTimeout((): void => {
          if (current())
            publish({
              phase: "error",
              scope,
              language,
              errorCode: "restart-incomplete",
            });
          reject(new Error("Language restart did not complete"));
        }, RESTART_GRACE_MS);
      });
      await Promise.race([dependencies.reload(), restartTimeout]);
      if (!current()) return;
    } catch (error: unknown) {
      if (!current()) return;
      clearRestartTimer();
      publish({
        phase: "error",
        scope,
        language,
        errorCode: snapshot.errorCode ?? failureCode,
      });
      throw error;
    }
  }

  function apply(
    language: SupportedLanguage,
    options: ApplyOptions = {}
  ): Promise<void> {
    let key = JSON.stringify({ generation, language });
    if (active?.key === key && (!options.persist || active.persists))
      return active.promise;
    if (active && !active.persists && options.persist) {
      generation += 1;
      clearRestartTimer();
      key = JSON.stringify({ generation, language });
    }
    const epoch = generation;
    lastRequest = { language, options };
    const promise = queue
      .then((): Promise<void> => perform(language, options, epoch))
      .finally((): void => {
        if (active?.promise === promise) active = null;
      });
    active = { key, promise, persists: options.persist !== undefined };
    queue = promise.catch((): void => undefined);
    return promise;
  }

  function retry(): Promise<void> {
    if (!lastRequest) return Promise.resolve();
    return apply(lastRequest.language, { ...lastRequest.options, retry: true });
  }

  return {
    getSnapshot: (): LanguageSnapshot => snapshot,
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    setScope,
    apply,
    retry,
  };
}
