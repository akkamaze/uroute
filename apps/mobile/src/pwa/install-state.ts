import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface InstallState {
  installed: boolean;
  platform: "android" | "ios" | "desktop";
  prompt: InstallPromptEvent | null;
  secure: boolean;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}
function detectPlatform(): InstallState["platform"] {
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }

  return /Android/.test(navigator.userAgent) ? "android" : "desktop";
}
let state: InstallState = {
  installed: isStandalone(),
  platform: detectPlatform(),
  prompt: null,
  secure: window.isSecureContext,
};
const listeners = new Set<() => void>();
function updateState(update: Partial<InstallState>): void {
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state);
}

export function observeInstallEvents(): () => void {
  function capturePrompt(event: Event): void {
    if (!("prompt" in event) || typeof event.prompt !== "function") {
      return;
    }
    event.preventDefault();
    updateState({ prompt: event as InstallPromptEvent });
  }
  function installed(): void {
    updateState({ installed: true, prompt: null });
  }
  function displayModeChanged(): void {
    updateState({ installed: isStandalone() });
  }
  const displayMode = window.matchMedia("(display-mode: standalone)");
  window.addEventListener("beforeinstallprompt", capturePrompt);
  window.addEventListener("appinstalled", installed);
  displayMode.addEventListener("change", displayModeChanged);

  return () => {
    window.removeEventListener("beforeinstallprompt", capturePrompt);
    window.removeEventListener("appinstalled", installed);
    displayMode.removeEventListener("change", displayModeChanged);
  };
}

export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = state.prompt;
  if (prompt === null) {
    return "unavailable";
  }
  // A browser prompt is single-use; consume it before another surface can invoke it.
  updateState({ prompt: null });
  const result = await prompt.prompt();

  return result.outcome;
}
