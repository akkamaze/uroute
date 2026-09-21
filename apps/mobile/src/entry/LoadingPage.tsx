import { useNavigate } from "@tanstack/react-router";
import { useAccount } from "@uroute/auth/useAccount";
import { useEffect } from "react";

import "./entry.css";

const TRANSITION_DELAY_MS = 1_200;

function LoadingBrand(): React.JSX.Element {
  return (
    <div aria-label="uroute" className="entry-brand" role="img">
      <svg
        aria-hidden="true"
        className="entry-brand__mark"
        fill="none"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="#1666ff" height="100" rx="25" width="100" />
        <path className="entry-brand__track" d="M27 39V61a21 21 0 0 0 42 0V41" pathLength="100" />
        <path className="entry-brand__route" d="M27 39V61a21 21 0 0 0 42 0V41" pathLength="100" />
        <circle className="entry-brand__destination" cx="69" cy="29" r="8.3" />
      </svg>

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
