import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <SignUp path="/sign-up" routing="path" signInUrl="/" />
    </main>
  );
}
