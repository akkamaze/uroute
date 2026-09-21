import { useAccount } from "@uroute/auth/useAccount";
import { useCanGoBack, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";

import { BrandMark } from "../brand";
import "./entry.css";

function GoogleMark(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.31 2.98-7.34Z"
        fill="#4285f4"
      />
      <path
        d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.05v2.59A10 10 0 0 0 12 22Z"
        fill="#34a853"
      />
      <path
        d="M6.39 13.89A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.89V7.52H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.48l3.34-2.59Z"
        fill="#fbbc05"
      />
      <path
        d="M12 5.97c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.95 5.52l3.34 2.59C7.18 7.74 9.39 5.97 12 5.97Z"
        fill="#ea4335"
      />
    </svg>
  );
}

export function LoginPage(): React.JSX.Element {
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/login" });
  const account = useAccount(search.authError === "1");

  useEffect(() => {
    if (account.user) {
      void navigate({ replace: true, to: "/trips" });
    }
  }, [account.user, navigate]);

  function goBack(): void {
    if (canGoBack) {
      router.history.back();

      return;
    }

    void navigate({ replace: true, to: "/welcome" });
  }

  return (
    <main className="entry-shell entry-shell--login" data-scroll-restoration-id="entry-main">
      <div className="login-page">
        <header className="login-header">
          <button
            aria-label="Go back"
            className="login-back"
            disabled={account.working}
            onClick={goBack}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} />
          </button>
        </header>

        <section className="login-content">
          <div className="login-brand">
            <BrandMark />

            <div aria-label="uroute" className="login-wordmark" role="img">
              <span>u</span>route
            </div>
          </div>

          <div className="login-introduction">
            <h1>
              Plan your <span>next trip.</span>
            </h1>

            <p>Sign in to keep your plans in one place.</p>
          </div>
        </section>

        <footer className="login-footer">
          <button
            className="google-action"
            disabled={account.loading || account.working}
            onClick={account.unavailable ? account.retry : account.signIn}
            type="button"
          >
            {!account.unavailable && <GoogleMark />}
            <span>
              {account.loading || account.working
                ? "Connecting…"
                : account.unavailable
                  ? "Try again"
                  : "Continue with Google"}
            </span>
          </button>

          {(account.unavailable || account.actionError) && (
            <p className="login-footer__error" role="alert">
              {account.unavailable
                ? "We could not check your account. Check your connection and try again."
                : account.actionError}
            </p>
          )}

          <p className="login-footer__notice">
            Google sign-in uses a secure browser session. Your password is never shared with uroute.
          </p>
        </footer>
      </div>
    </main>
  );
}
