import {
  useCanGoBack,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";

import { BrandMark } from "../brand";
import "./entry.css";

interface ProfileDialogHistoryState {
  profileDialogEntry?: true;
}

function isProfileDialogHistoryEntry(state: object): state is object & ProfileDialogHistoryState {
  return "profileDialogEntry" in state && state.profileDialogEntry === true;
}

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const signInButtonRef = useRef<HTMLButtonElement>(null);
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/login" });
  const isProfileDialogEntry = useRouterState({
    select: (state) => isProfileDialogHistoryEntry(state.location.state),
  });
  const profileDialogOpen = search.profile === "open";

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (profileDialogOpen && !dialog.open) {
      dialog.showModal();
    } else if (!profileDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [profileDialogOpen]);

  function openProfileDialog(): void {
    void navigate({
      resetScroll: false,
      search: { profile: "open" },
      state: (current) => {
        const next = { ...current, profileDialogEntry: true as const };

        return next;
      },
      to: "/login",
    });
  }

  function closeProfileDialog(): void {
    if (isProfileDialogEntry && canGoBack) {
      router.history.back();

      return;
    }

    void navigate({
      replace: true,
      resetScroll: false,
      search: {},
      state: (current) => {
        const next: Record<string, unknown> = { ...current };

        delete next.profileDialogEntry;

        return next;
      },
      to: "/login",
    });
  }

  function restoreSignInFocus(): void {
    signInButtonRef.current?.focus();
  }

  function closeFromBackdrop(event: React.MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) {
      closeProfileDialog();
    }
  }

  function closeFromEscape(event: React.SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    closeProfileDialog();
  }

  function goBack(): void {
    if (canGoBack) {
      router.history.back();

      return;
    }

    void navigate({ replace: true, to: "/welcome" });
  }

  function chooseMina(): void {
    void navigate({ replace: true, to: "/trips" });
  }

  return (
    <main className="entry-shell entry-shell--login" data-scroll-restoration-id="entry-main">
      <div className="login-page">
        <header className="login-header">
          <button aria-label="Go back" className="login-back" onClick={goBack} type="button">
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
            onClick={openProfileDialog}
            ref={signInButtonRef}
            type="button"
          >
            <GoogleMark />
            <span>Continue with Google</span>
          </button>

          <p className="login-footer__notice">
            Google sign-in is not connected yet. Continue with a sample profile.
          </p>
        </footer>
      </div>

      <dialog
        aria-labelledby="profile-dialog-title"
        className="profile-dialog"
        onCancel={closeFromEscape}
        onClick={closeFromBackdrop}
        onClose={restoreSignInFocus}
        ref={dialogRef}
      >
        <div className="profile-dialog__content">
          <h2 id="profile-dialog-title">Choose a profile</h2>

          <button className="profile-choice" onClick={chooseMina} type="button">
            <span aria-hidden="true" className="profile-choice__avatar">
              M
            </span>
            <span>
              <strong>Mina</strong>
              <small>Continue as Mina</small>
            </span>
          </button>

          <button className="profile-dialog__cancel" onClick={closeProfileDialog} type="button">
            Cancel
          </button>
        </div>
      </dialog>
    </main>
  );
}
