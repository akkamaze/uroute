import { Download, EllipsisVertical, Share, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { requestInstall, useInstallState } from "./install-state";
import "./install-help.css";

interface InstallHelpDialogProps {
  open: boolean;
  onClose: () => void;
}
export function InstallHelpDialog({ open, onClose }: InstallHelpDialogProps): React.JSX.Element {
  const installation = useInstallState();
  const [platform, setPlatform] = useState<"android" | "ios">(
    installation.platform === "ios" ? "ios" : "android",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function install(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const outcome = await requestInstall();
      setMessage(
        outcome === "accepted"
          ? "Your browser is finishing installation."
          : "You can also install from your browser menu below.",
      );
    } catch {
      setMessage("The install prompt could not open. Try your browser menu below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      aria-labelledby="install-help-title"
      className="install-help"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="install-help__surface">
        <header>
          <h2 id="install-help-title">
            {installation.installed ? "uroute is installed" : "Install uroute"}
          </h2>
          <button
            aria-label="Close installation help"
            className="install-help__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={21} />
          </button>
        </header>
        {installation.installed ? (
          <p>uroute has been added to this device. Open it from your home screen.</p>
        ) : (
          <>
            <p>Keep your trips a tap away on your home screen.</p>
            {installation.prompt !== null || busy ? (
              <button
                className="install-help__install"
                disabled={busy}
                onClick={() => void install()}
                type="button"
              >
                <Download aria-hidden="true" size={19} />
                {busy ? "Opening browser…" : "Install on this device"}
              </button>
            ) : null}
            {!installation.secure ? (
              <p className="install-help__notice">
                Open the secure uroute website in your browser before installing.
              </p>
            ) : null}
            <div aria-label="Installation instructions" className="install-help__platforms">
              <button
                aria-pressed={platform === "android"}
                onClick={() => setPlatform("android")}
                type="button"
              >
                Android
              </button>
              <button
                aria-pressed={platform === "ios"}
                onClick={() => setPlatform("ios")}
                type="button"
              >
                iPhone / iPad
              </button>
            </div>
            <ol className="install-help__steps">
              {platform === "ios" ? (
                <>
                  <li>
                    <Smartphone aria-hidden="true" size={20} />
                    <span>
                      Open uroute in <strong>Safari</strong>.
                    </span>
                  </li>
                  <li>
                    <Share aria-hidden="true" size={20} />
                    <span>
                      Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
                    </span>
                  </li>
                  <li>
                    <Download aria-hidden="true" size={20} />
                    <span>
                      Keep <strong>Open as Web App</strong> on if shown, then tap{" "}
                      <strong>Add</strong>.
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Smartphone aria-hidden="true" size={20} />
                    <span>
                      Open uroute in <strong>Chrome</strong>.
                    </span>
                  </li>
                  <li>
                    <EllipsisVertical aria-hidden="true" size={20} />
                    <span>
                      Open the browser menu, then choose <strong>Add to Home screen</strong> or{" "}
                      <strong>Install app</strong>.
                    </span>
                  </li>
                  <li>
                    <Download aria-hidden="true" size={20} />
                    <span>Follow the browser's confirmation to add uroute.</span>
                  </li>
                </>
              )}
            </ol>
            <p className="install-help__note">
              Menu names and availability depend on your browser.
            </p>
            {message.length > 0 ? (
              <p className="install-help__notice" role="status">
                {message}
              </p>
            ) : null}
          </>
        )}
        <button className="install-help__done" onClick={onClose} type="button">
          Got it
        </button>
      </div>
    </dialog>
  );
}
