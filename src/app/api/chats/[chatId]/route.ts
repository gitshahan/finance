import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import {
  cleanupOrphanedReceiptBlobs,
  DEFAULT_CHAT_ID,
  deleteChatForUser,
  isChatPersistenceConfigured,
  isValidChatId,
  loadMessagesByUser,
  renameChatForUser,
} from "@/lib/chat-store";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
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

  const { chatId } = await context.params;
  if (!isValidChatId(chatId)) {
    return new Response("Invalid chat id.", { status: 400 });
  }

  const messages = await loadMessagesByUser(userId, chatId);
  return Response.json({ chatId, messages });
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const { chatId } = await context.params;
  if (!isValidChatId(chatId)) {
    return new Response("Invalid chat id.", { status: 400 });
  }

  const body = (await request.json()) as { title?: string };
  if (!body.title?.trim()) {
    return new Response("Title is required.", { status: 400 });
  }

  const chat = await renameChatForUser(userId, chatId, body.title);
  if (!chat) {
    return new Response("Chat not found.", { status: 404 });
  }

  return Response.json({ chat });
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  const { chatId } = await context.params;
  if (!isValidChatId(chatId) || chatId === DEFAULT_CHAT_ID) {
    return new Response("Cannot delete this chat.", { status: 400 });
  }

  const result = await deleteChatForUser(userId, chatId);
  if (!result.ok) {
    return new Response(result.error, { status: 400 });
  }

  // Don't block the delete response on blob storage cleanup.
  const orphanUrls = result.orphanCandidateUrls;
  if (orphanUrls.length > 0) {
    after(() => {
      void cleanupOrphanedReceiptBlobs(userId, orphanUrls);
    });
  }

  return Response.json({ ok: true });
}
