import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  createIdGenerator,
  streamText,
  type UIMessage,
} from "ai";
import { replaceMessagesByUser } from "@/lib/chat-store";
import { prepareMessagesForModel } from "@/lib/receipt-blob";
import { RECEIPT_ASSISTANT_SYSTEM_PROMPT } from "@/lib/receipt-assistant-prompt";

export const maxDuration = 30;

type ChatRequestBody = {
  messages: UIMessage[];
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

    const { messages }: ChatRequestBody = await request.json();
    const modelMessages = await convertToModelMessages(
      await prepareMessagesForModel(userId, messages),
    );

    const result = streamText({
      model: "openai/gpt-5.5",
      system: RECEIPT_ASSISTANT_SYSTEM_PROMPT,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: async ({ messages: completedMessages }) => {
        await replaceMessagesByUser(userId, completedMessages);
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
