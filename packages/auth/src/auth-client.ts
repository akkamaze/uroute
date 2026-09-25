import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  fetchOptions: { retry: 0, timeout: 10_000 },
  sessionOptions: { refetchOnWindowFocus: true, refetchWhenOffline: false },
});
