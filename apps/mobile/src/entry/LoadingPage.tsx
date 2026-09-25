import { useNavigate } from "@tanstack/react-router";
import { useAccount } from "@uroute/auth/useAccount";
import { useEffect } from "react";

import { AnimatedBrandMark } from "../brand";
import "./entry.css";

const TRANSITION_DELAY_MS = 1_200;

function LoadingBrand(): React.JSX.Element {
  return (
    <div aria-label="uroute" className="entry-brand" role="img">
      <AnimatedBrandMark />

      <span className="entry-brand__wordmark">
        <span>u</span>route
      </span>
    </div>
  );
}

export function LoadingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { loading, user } = useAccount();

  useEffect(() => {
    if (loading) {
      return;
    }

    const transitionTimer = window.setTimeout(() => {
      void navigate({ to: user ? "/trips" : "/welcome", replace: true });
    }, TRANSITION_DELAY_MS);

    return () => {
      window.clearTimeout(transitionTimer);
    };
  }, [loading, navigate, user]);

  function continueToWelcome(): void {
    void navigate({ to: user ? "/trips" : "/welcome", replace: true });
  }

  return (
    <main className="entry-shell" data-scroll-restoration-id="entry-main">
      <div className="loading-preview">
        <LoadingBrand />

        <p aria-live="polite" className="loading-preview__status" role="status">
          Opening uroute…
        </p>

        <button
          className="loading-preview__continue"
          disabled={loading}
          onClick={continueToWelcome}
          type="button"
        >
          Continue
        </button>
      </div>
    </main>
  );
}
