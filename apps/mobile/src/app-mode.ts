import { useSyncExternalStore } from "react";

export type AppMode = "real" | "mock";

const STORAGE_KEY = "uroute.app-mode.v1";
const listeners = new Set<() => void>();

function readMode(): AppMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "mock" ? "mock" : "real";
  } catch {
    return "real";
  }
}

let currentMode: AppMode = typeof window === "undefined" ? "real" : readMode();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      currentMode = readMode();
      emit();
    }
  });
}

export function getAppMode(): AppMode {
  return currentMode;
}

export function useAppMode(): AppMode {
  return useSyncExternalStore(subscribe, getAppMode, () => "real");
}

export function setAppMode(mode: AppMode): void {
  if (mode === currentMode) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, mode);
  currentMode = mode;
  emit();
}
