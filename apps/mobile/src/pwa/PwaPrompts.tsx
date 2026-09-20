import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import "./pwa-prompts.css";

import { requestInstall, useInstallState } from "./install-state";

export function PwaPrompts(): React.JSX.Element | null {
  const installation = useInstallState();
  const [installationDismissed, setInstallationDismissed] = useState(false);
  const installPrompt =
    installationDismissed || installation.installed ? null : installation.prompt;
  const installGuidance =
    installationDismissed ||
    installation.installed ||
    !installation.secure ||
    installation.platform === "desktop"
      ? null
      : installation.platform;
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

  function closeStatus(): void {
    setNeedRefresh(false);
    setOfflineReady(false);
    setErrorMessage(null);
    setInstallationDismissed(true);
  }

  async function installApp(): Promise<void> {
    if (installPrompt === null) {
      return;
    }

    try {
      await requestInstall();
    } catch {
      setErrorMessage("The install prompt could not be opened.");
    } finally {
      setInstallationDismissed(true);
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
