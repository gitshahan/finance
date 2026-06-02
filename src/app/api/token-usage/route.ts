import { auth } from "@clerk/nextjs/server";
import { getUserTokenUsage } from "@/lib/token-usage-store";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const usage = await getUserTokenUsage(userId);
    return Response.json({ usage });
  } catch (error) {
    console.error("Failed to load token usage:", error);
    return new Response("Unable to load usage.", { status: 500 });
  }
}
