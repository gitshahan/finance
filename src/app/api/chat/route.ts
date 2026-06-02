import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  createIdGenerator,
  streamText,
  type UIMessage,
} from "ai";
import {
  isChatPersistenceConfigured,
  replaceMessagesByUser,
} from "@/lib/chat-store";
import { buildChatSystemPrompt } from "@/lib/chat-context";
import {
  messagesOnlyUseOwnedReceiptBlobs,
  prepareMessagesForModel,
} from "@/lib/receipt-blob";
import { syncNewReceiptsFromMessages } from "@/lib/receipt-extraction";
import { addUserTokenUsage, getUserTokenUsage } from "@/lib/token-usage-store";
import { CHAT_MODEL } from "@/lib/ai-model";

export const maxDuration = 60;

type ChatRequestBody = {
  messages: UIMessage[];
  userId?: string;
};

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

    if (isChatPersistenceConfigured()) {
      await syncNewReceiptsFromMessages(userId, messages);
    }

    const system = await buildChatSystemPrompt(userId);
    const modelMessages = await convertToModelMessages(
      await prepareMessagesForModel(userId, messages),
    );

    const result = streamText({
      model: CHAT_MODEL,
      system,
      messages: modelMessages,
      onFinish: async ({ totalUsage }) => {
        await addUserTokenUsage(userId, {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
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
