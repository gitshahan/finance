import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { AUTH_COMPLETE_URL } from "@/lib/auth-redirect";

export default function SsoCallbackPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 p-6 dark:bg-black">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
        aria-hidden="true"
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Finishing sign in…
      </p>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={AUTH_COMPLETE_URL}
        signUpForceRedirectUrl={AUTH_COMPLETE_URL}
      />
    </main>
  );
}
