import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import "./pwa-prompts.css";

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallGuidance = "android" | "ios";

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

function getInstallGuidance(): InstallGuidance | null {
  if (!window.isSecureContext) {
    return null;
  }

  const userAgent = navigator.userAgent;
  const iosDevice =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);

  if (installed) {
    return null;
  }

  if (iosDevice) {
    return "ios";
  }

  return /Android/.test(userAgent) ? "android" : null;
}

export function PwaPrompts(): React.JSX.Element | null {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installGuidance, setInstallGuidance] = useState<InstallGuidance | null>(
    getInstallGuidance,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => {
      setErrorMessage("Offline setup is unavailable right now.");
    },
  });

  useEffect(() => {
    function captureInstallPrompt(event: Event): void {
      if (!isInstallPromptEvent(event)) {
        return;
      }

      event.preventDefault();
      setInstallPrompt(event);
    }

    function clearInstallPrompt(): void {
      setInstallPrompt(null);
      setInstallGuidance(null);
    }

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  function closeStatus(): void {
    setNeedRefresh(false);
    setOfflineReady(false);
    setErrorMessage(null);
    setInstallPrompt(null);
    setInstallGuidance(null);
  }

  async function installApp(): Promise<void> {
    if (installPrompt === null) {
      return;
    }

    try {
      await installPrompt.prompt();
    } catch {
      setErrorMessage("The install prompt could not be opened.");
    } finally {
      setInstallPrompt(null);
    }
  }

  async function applyUpdate(): Promise<void> {
    try {
      await updateServiceWorker(true);
    } catch {
      setErrorMessage("The update could not be applied. Try again later.");
    }
  }

  if (
    !needRefresh &&
    !offlineReady &&
    errorMessage === null &&
    installPrompt === null &&
    installGuidance === null
  ) {
    return null;
  }

  const message =
    errorMessage !== null
      ? errorMessage
      : needRefresh
        ? "An uroute update is ready."
        : offlineReady
          ? "App screens are ready offline. Map tiles still need a connection."
          : installPrompt !== null
            ? "Install uroute on this device."
            : installGuidance === "ios"
              ? "On iPhone or iPad, tap Share, then Add to Home Screen."
              : "In Chrome, open the menu and choose Install app or Add to Home screen.";

  return (
    <aside aria-live="polite" className="pwa-prompt" role="status">
      <p>{message}</p>

      <div className="pwa-prompt__actions">
        {needRefresh && errorMessage === null ? (
          <button onClick={() => void applyUpdate()} type="button">
            Update
          </button>
        ) : null}

        {!needRefresh && !offlineReady && errorMessage === null && installPrompt !== null ? (
          <button onClick={() => void installApp()} type="button">
            Install
          </button>
        ) : null}

        <button className="pwa-prompt__later" onClick={closeStatus} type="button">
          {offlineReady && !needRefresh && errorMessage === null ? "Got it" : "Later"}
        </button>
      </div>
    </aside>
  );
}
