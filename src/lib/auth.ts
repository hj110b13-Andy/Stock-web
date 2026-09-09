import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google-only sign-in (no passwords to manage). Watchlist sync is entirely
// optional on top of this — signing in works even without Redis configured,
// it just means cross-device sync won't have anywhere to persist to (see
// lib/watchlistStore.ts). Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET /
// AUTH_SECRET from the environment (next-auth's default convention).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
});
