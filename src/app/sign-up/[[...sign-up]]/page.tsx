import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AUTH_COMPLETE_URL } from "@/lib/auth-redirect";

export default async function SignUpPage() {
  const { userId } = await auth();

  if (userId) {
    redirect(AUTH_COMPLETE_URL);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        forceRedirectUrl={AUTH_COMPLETE_URL}
      />
    </main>
  );
}
