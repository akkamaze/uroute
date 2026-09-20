import { Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, BriefcaseBusiness, ChevronRight, Download, LogOut } from "lucide-react";
import { useState } from "react";

import { Brand } from "../brand";
import "./account.css";

export function AccountPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  function showInstallHelp(): void {
    setMessage("Use your browser menu to install uroute on this device.");
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

        <button onClick={showInstallHelp} type="button">
          <span className="account-menu__icon">
            <Download aria-hidden="true" size={22} strokeWidth={1.8} />
          </span>
          <span className="account-menu__copy">
            <strong>Install uroute</strong>
            <span>Add the app to this device</span>
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

      {message.length > 0 ? (
        <p aria-live="polite" className="account-page__message">
          {message}
        </p>
      ) : null}

      <footer className="account-page__footer">
        <Brand />
        <p>Account sign-in and sync are not connected yet.</p>
      </footer>
    </section>
  );
}
