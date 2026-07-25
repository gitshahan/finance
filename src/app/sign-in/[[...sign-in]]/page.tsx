import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AUTH_COMPLETE_URL } from "@/lib/auth-redirect";

export default async function SignInPage() {
  const { userId } = await auth();

  if (userId) {
    redirect(AUTH_COMPLETE_URL);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex items-center gap-3">
        <img
          src="/vite.svg"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-xl bg-white object-contain p-1 shadow-sm"
        />
        <p className="font-display text-xl font-semibold tracking-display text-foreground">
          Autonicals Finance
        </p>
      </div>
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        forceRedirectUrl={AUTH_COMPLETE_URL}
      />
    </main>
  );
}
