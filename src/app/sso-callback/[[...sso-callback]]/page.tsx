import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { AUTH_COMPLETE_URL } from "@/lib/auth-redirect";

export default function SsoCallbackPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-background p-6">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-brand-muted border-t-brand"
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
