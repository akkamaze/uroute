import { useAccount } from "@uroute/auth/useAccount";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Bookmark,
  BriefcaseBusiness,
  ChevronRight,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { InstallHelpDialog } from "../pwa/InstallHelpDialog";
import { useInstallState } from "../pwa/install-state";
import "./account.css";

export function AccountPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/user" });
  const account = useAccount();
  const installation = useInstallState();
  const installOpen = search.install === "open";
  const installButtonRef = useRef<HTMLButtonElement>(null);
  const openedHereRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (installOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      installButtonRef.current?.focus();
      wasOpenRef.current = false;
      openedHereRef.current = false;
    }
  }, [installOpen]);

  function showInstallHelp(): void {
    openedHereRef.current = true;
    void navigate({ resetScroll: false, search: { install: "open" }, to: "/user" });
  }

  function closeInstallHelp(): void {
    if (openedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ replace: true, resetScroll: false, search: {}, to: "/user" });
    }
  }

  async function signOut(): Promise<void> {
    if (await account.signOut()) {
      void navigate({ replace: true, to: "/welcome" });
    }
  }

  function signIn(): void {
    void navigate({ to: "/login" });
  }

  const initial = account.user?.name.trim().slice(0, 1).toUpperCase() || "•";

  return (
    <section className="account-page">
      <header className="account-page__header">
        <h1>Account</h1>
      </header>

      <section aria-label="Profile" className="account-profile">
        <span aria-hidden="true" className="account-profile__avatar">
          {account.loading ? "" : initial}
        </span>
        <h2>{account.loading ? "Checking your account…" : (account.user?.name ?? "Guest")}</h2>
        <p>
          {account.user?.email ??
            (account.unavailable
              ? "Account service is unavailable"
              : "Sign in to use your account across devices")}
        </p>
      </section>

      {(account.unavailable || account.actionError) && (
        <p className="account-page__message" role="alert">
          {account.unavailable
            ? "We could not check your account. Please try again."
            : account.actionError}
        </p>
      )}

      <nav aria-label="Account" className="account-menu">
        <Link to="/trips">
          <span className="account-menu__icon">
            <BriefcaseBusiness aria-hidden="true" size={22} strokeWidth={1.8} />
          </span>
          <span className="account-menu__copy">
            <strong>Your trips</strong>
            <span>2 upcoming trips</span>
          </span>
          <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </Link>

        <Link to="/saved">
          <span className="account-menu__icon">
            <Bookmark aria-hidden="true" size={22} strokeWidth={1.8} />
          </span>
          <span className="account-menu__copy">
            <strong>Saved places</strong>
            <span>Keep ideas for later</span>
          </span>
          <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </Link>

        <button onClick={showInstallHelp} ref={installButtonRef} type="button">
          <span className="account-menu__icon">
            <Download aria-hidden="true" size={22} strokeWidth={1.8} />
          </span>
          <span className="account-menu__copy">
            <strong>{installation.installed ? "App installed" : "Install uroute"}</strong>
            <span>
              {installation.installed ? "Ready on this device" : "Add the app to this device"}
            </span>
          </span>
          <ChevronRight aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>

        {account.unavailable ? (
          <button disabled={account.working} onClick={account.retry} type="button">
            <span className="account-menu__icon">
              <RefreshCw aria-hidden="true" size={22} strokeWidth={1.8} />
            </span>
            <span className="account-menu__copy">
              <strong>{account.working ? "Checking…" : "Try again"}</strong>
              <span>Check your account session again</span>
            </span>
          </button>
        ) : account.user ? (
          <button
            className="account-menu__signout"
            disabled={account.working}
            onClick={() => void signOut()}
            type="button"
          >
            <span className="account-menu__icon">
              <LogOut aria-hidden="true" size={22} strokeWidth={1.8} />
            </span>
            <span className="account-menu__copy">
              <strong>{account.working ? "Signing out…" : "Sign out"}</strong>
              <span>Return to welcome</span>
            </span>
          </button>
        ) : (
          <button disabled={account.loading} onClick={signIn} type="button">
            <span className="account-menu__icon">
              <LogIn aria-hidden="true" size={22} strokeWidth={1.8} />
            </span>
            <span className="account-menu__copy">
              <strong>Continue with Google</strong>
              <span>Use your account across devices</span>
            </span>
          </button>
        )}
      </nav>

      <InstallHelpDialog onClose={closeInstallHelp} open={installOpen} />
    </section>
  );
}
