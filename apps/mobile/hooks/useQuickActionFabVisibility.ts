import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useSyncExternalStore } from "react";

const activeSuppressors = new Set<symbol>();
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  return activeSuppressors.size > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function setSuppressed(source: symbol, isSuppressed: boolean): void {
  const changed = isSuppressed
    ? !activeSuppressors.has(source)
    : activeSuppressors.has(source);
  if (!changed) return;

  if (isSuppressed) activeSuppressors.add(source);
  else activeSuppressors.delete(source);
  for (const listener of listeners) listener();
}

export function useIsQuickActionFabSuppressed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSuppressQuickActionFabWhenFocused(
  shouldSuppress: boolean
): void {
  const sourceRef = useRef(Symbol("quick-action-fab-suppression"));

  useFocusEffect(
    useCallback(() => {
      setSuppressed(sourceRef.current, shouldSuppress);
      return (): void => {
        setSuppressed(sourceRef.current, false);
      };
    }, [shouldSuppress])
  );
}
