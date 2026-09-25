import { useEffect, useRef, useState } from "react";

import { authClient } from "./auth-client";

type AccountAction = "retry" | "sign-in" | "sign-out";

interface AccountState {
  actionError: string | null;
  loading: boolean;
  retry: () => void;
  signIn: () => void;
  signOut: () => Promise<boolean>;
  unavailable: boolean;
  user: { id: string; email: string; name: string } | null;
  working: boolean;
}

export function useAccount(callbackFailed = false): AccountState {
  const { data, error: sessionError, isPending, refetch } = authClient.useSession();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(() =>
    callbackFailed ? "Sign-in was not completed. Please try again." : null,
  );
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const restore = (): void => {
      busy.current = false;
      setWorking(false);
    };

    window.addEventListener("pageshow", restore);

    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  async function perform(action: AccountAction): Promise<boolean> {
    if (busy.current) {
      return false;
    }

    busy.current = true;
    setWorking(true);
    setActionError(null);
    let redirecting = false;

    try {
      if (action === "retry") {
        await refetch();
      } else if (action === "sign-out") {
        const result = await authClient.signOut();

        if (result.error) {
          throw new Error("Sign-out failed.");
        }

        await refetch();
      } else {
        const callbackURL = new URL("/trips", window.location.origin);
        const errorCallbackURL = new URL("/login?authError=1", window.location.origin);
        const result = await authClient.signIn.social({
          callbackURL: callbackURL.href,
          disableRedirect: true,
          errorCallbackURL: errorCallbackURL.href,
          provider: "google",
        });

        if (result.error || !result.data?.url) {
          throw new Error("Sign-in failed.");
        }

        if (mounted.current) {
          window.location.assign(result.data.url);
          redirecting = true;
        }
      }

      return true;
    } catch {
      if (mounted.current) {
        setActionError(
          action === "sign-out"
            ? "Could not sign out. Please try again."
            : "Could not connect to your account. Please try again.",
        );
      }

      return false;
    } finally {
      if (!redirecting) {
        busy.current = false;

        if (mounted.current) {
          setWorking(false);
        }
      }
    }
  }

  return {
    actionError,
    loading: isPending && !data,
    retry: (): void => {
      void perform("retry");
    },
    signIn: (): void => {
      void perform("sign-in");
    },
    signOut: async (): Promise<boolean> => perform("sign-out"),
    unavailable: Boolean(sessionError),
    user: data?.user ?? null,
    working,
  };
}
