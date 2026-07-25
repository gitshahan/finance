import { auth } from "@clerk/nextjs/server";
import {
  createChatForUser,
  isChatPersistenceConfigured,
  listChatsByUser,
} from "@/lib/chat-store";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isChatPersistenceConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured.", chats: [] },
      { status: 503 },
    );
  }

  const chats = await listChatsByUser(userId);
  return Response.json({ chats });
}

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isChatPersistenceConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const chat = await createChatForUser(userId);
  return Response.json({ chat }, { status: 201 });
}
