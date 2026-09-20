import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Bookmark, BriefcaseBusiness, ChevronRight, Download, LogOut } from "lucide-react";
import { useEffect, useRef } from "react";

import { InstallHelpDialog } from "../pwa/InstallHelpDialog";
import { useInstallState } from "../pwa/install-state";
import "./account.css";

export function AccountPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = useSearch({ from: "/mobile-shell/user" });
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
    void navigate({ to: "/user", search: { install: "open" }, resetScroll: false });
  }
  function closeInstallHelp(): void {
    if (openedHereRef.current) {
      window.history.back();
    } else {
      void navigate({ to: "/user", search: {}, replace: true, resetScroll: false });
    }
  }
  function signOut(): void {
    void navigate({ replace: true, to: "/login" });
  }

  return (
    <section className="account-page">
      <header className="account-page__header">
        <h1>Account</h1>
      </header>

      <section className="account-profile" aria-label="Profile">
        <img alt="Mina" src="/images/avatar.png" />
        <h2>Mina</h2>
        <p>Ready for the next adventure</p>
      </section>

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

        <button className="account-menu__signout" onClick={signOut} type="button">
          <span className="account-menu__icon">
            <LogOut aria-hidden="true" size={22} strokeWidth={1.8} />
          </span>
          <span className="account-menu__copy">
            <strong>Sign out</strong>
            <span>Return to sign in</span>
          </span>
        </button>
      </nav>

      <InstallHelpDialog onClose={closeInstallHelp} open={installOpen} />
    </section>
  );
}
