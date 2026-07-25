import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import {
  isChatPersistenceConfigured,
  replaceMessagesByUser,
} from "@/lib/chat-store";
import { buildChatSystemPrompt } from "@/lib/chat-context";
import { applyHistoryWindow } from "@/lib/chat-history-window";
import {
  messagesOnlyUseOwnedReceiptBlobs,
  prepareMessagesForModel,
} from "@/lib/receipt-blob";
import { syncNewReceiptsFromMessages } from "@/lib/receipt-extraction";
import {
  addUserTokenUsage,
  getUserTokenUsage,
  tryReserveChatRequest,
} from "@/lib/token-usage-store";
import { CHAT_MODEL } from "@/lib/ai-model";
import { createChatTools } from "@/lib/chat-tools";

export const maxDuration = 60;

const MAX_CHAT_MESSAGES = 200;
const MAX_MESSAGE_PARTS = 40;

type ChatRequestBody = {
  messages: UIMessage[];
  userId?: string;
};

function isValidChatMessages(messages: unknown): messages is UIMessage[] {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= MAX_CHAT_MESSAGES &&
    messages.every(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof (message as UIMessage).id === "string" &&
        Array.isArray((message as UIMessage).parts) &&
        (message as UIMessage).parts.length <= MAX_MESSAGE_PARTS,
    )
  );
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!process.env.AI_GATEWAY_API_KEY) {
      return new Response(
        "AI Gateway is not configured (missing AI_GATEWAY_API_KEY).",
        {
          status: 500,
        },
      );
    }

    const body = (await request.json()) as ChatRequestBody;

    if (body.userId && body.userId !== userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages } = body;

    if (!isValidChatMessages(messages)) {
      return new Response("Invalid or oversized chat payload.", { status: 400 });
    }

    if (!messagesOnlyUseOwnedReceiptBlobs(userId, messages)) {
      return new Response("Forbidden", { status: 403 });
    }

    const usage = await getUserTokenUsage(userId);

    if (usage.isQuotaExceeded) {
      return Response.json(
        {
          error:
            "Usage limit reached. You have used your allocated token budget for this account.",
          usage,
        },
        { status: 429 },
      );
    }

    const reservedUsage = await tryReserveChatRequest(userId);

    if (!reservedUsage) {
      const latestUsage = await getUserTokenUsage(userId);
      return Response.json(
        {
          error:
            "Usage limit reached. You have used your allocated token budget for this account.",
          usage: latestUsage,
        },
        { status: 429 },
      );
    }

    if (
      reservedUsage.totalTokens >= reservedUsage.maxTotalTokens ||
      reservedUsage.totalOutputTokens >= reservedUsage.maxOutputTokens
    ) {
      return Response.json(
        {
          error:
            "Usage limit reached. You have used your allocated token budget for this account.",
          usage: reservedUsage,
        },
        { status: 429 },
      );
    }

    if (isChatPersistenceConfigured()) {
      await syncNewReceiptsFromMessages(userId, messages);
    }

    const system = await buildChatSystemPrompt(userId);
    // Trim to a sliding window before re-inlining blobs so old image turns are
    // not re-fetched/re-sent each request. Full thread is still persisted below.
    const windowedMessages = applyHistoryWindow(messages);
    const modelMessages = await convertToModelMessages(
      await prepareMessagesForModel(userId, windowedMessages),
    );

    const result = streamText({
      model: CHAT_MODEL,
      system,
      messages: modelMessages,
      tools: createChatTools({ userId, messages }),
      stopWhen: stepCountIs(5),
      maxOutputTokens: 1500,
      onFinish: async ({ totalUsage }) => {
        await addUserTokenUsage(userId, {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
          skipRequestIncrement: true,
        });
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: async ({ messages: completedMessages }) => {
        if (isChatPersistenceConfigured()) {
          await syncNewReceiptsFromMessages(userId, completedMessages);
          await replaceMessagesByUser(userId, completedMessages);
        }
      },
    });
  } catch (error) {
    console.error("Chat route failed:", error);
    return new Response(
      "Unable to generate a reply right now. Check server configuration and try again.",
      { status: 500 },
    );
  }
}
