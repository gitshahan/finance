import { SignIn } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <SignIn path="/" routing="path" />
    </main>
  );
}
