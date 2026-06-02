import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AUTH_COMPLETE_URL } from "@/lib/auth-redirect";

export default async function Home() {
  const { userId } = await auth();

  redirect(userId ? AUTH_COMPLETE_URL : "/sign-in");
}
