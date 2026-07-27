import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import {
  DEFAULT_CHAT_ID,
  isChatPersistenceConfigured,
  isValidChatId,
  replaceMessagesByUser,
} from "@/lib/chat-store";
import { buildChatSystemPrompt } from "@/lib/chat-context";
import { applyHistoryWindow } from "@/lib/chat-history-window";
import {
  messagesOnlyUseOwnedReceiptBlobs,
  prepareMessagesForModel,
} from "@/lib/receipt-blob";
import {
  countCandidateReceiptExtractions,
  MAX_NEW_EXTRACTIONS_PER_REQUEST,
  syncNewReceiptsFromMessages,
} from "@/lib/receipt-extraction";
import {
  addUserTokenUsage,
  buildChatBudgetReservation,
  getUserTokenUsage,
  isTokenUsageConfigured,
  reconcileReservedTokenUsage,
  tryReserveChatBudget,
  type TokenReservation,
} from "@/lib/token-usage-store";
import { getChatModel } from "@/lib/ai-model";
import { createChatTools } from "@/lib/chat-tools";
import {
  getUserLlmCredentialStatus,
  isLlmCredentialsConfigured,
} from "@/lib/llm-credentials-store";
import { getUnlockedOpenAiApiKey } from "@/lib/llm-unlock-session";

export const maxDuration = 60;

const MAX_CHAT_MESSAGES = 200;
const MAX_MESSAGE_PARTS = 40;
const CHAT_MAX_OUTPUT_TOKENS = 1500;

type ChatRequestBody = {
  messages: UIMessage[];
  userId?: string;
  chatId?: string;
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

function messageHasFilePart(message: UIMessage) {
  return message.parts.some(
    (part) => part.type === "file" && Boolean(part.url),
  );
}

/** New chats must open with a shared file; follow-ups may be text-only. */
function isAllowedToStartOrContinueChat(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user");
  if (userMessages.length === 0) {
    return false;
  }

  if (userMessages.length === 1) {
    return messageHasFilePart(userMessages[0]);
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!isLlmCredentialsConfigured()) {
      return new Response(
        "API key storage is not configured (missing DATABASE_URL or encryption secret).",
        { status: 503 },
      );
    }

    const apiKey = await getUnlockedOpenAiApiKey(userId);
    if (!apiKey) {
      const status = await getUserLlmCredentialStatus(userId, false);
      return new Response(
        status.configured
          ? "Unlock your API key with your encryption key before chatting."
          : "Add your OpenAI API key and encryption key before chatting.",
        { status: 403 },
      );
    }

    // Fail closed: never serve AI without a durable quota store.
    if (!isTokenUsageConfigured()) {
      return new Response(
        "Usage tracking is not configured (missing DATABASE_URL). Chat is disabled until quotas can be enforced.",
        { status: 503 },
      );
    }

    const body = (await request.json()) as ChatRequestBody;

    if (body.userId && body.userId !== userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages } = body;
    const chatId =
      typeof body.chatId === "string" && body.chatId.trim()
        ? body.chatId.trim()
        : DEFAULT_CHAT_ID;

    if (!isValidChatId(chatId)) {
      return new Response("Invalid chat id.", { status: 400 });
    }

    if (!isValidChatMessages(messages)) {
      return new Response("Invalid or oversized chat payload.", { status: 400 });
    }

    if (!isAllowedToStartOrContinueChat(messages)) {
      return new Response(
        "Start the chat by uploading a CSV file (under 1MB).",
        { status: 400 },
      );
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

    const candidateExtractions = countCandidateReceiptExtractions(userId, messages);
    const plannedExtractions = Math.min(
      candidateExtractions,
      MAX_NEW_EXTRACTIONS_PER_REQUEST,
    );
    const reservation = buildChatBudgetReservation(plannedExtractions);
    const reservedUsage = await tryReserveChatBudget(userId, reservation);

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

    // Index receipts after the reply starts so first tokens aren't blocked on
    // blob/DB sync. Attached CSV text is inlined for the model below.
    const windowedMessages = applyHistoryWindow(messages);
    const [system, preparedMessages] = await Promise.all([
      buildChatSystemPrompt(userId),
      prepareMessagesForModel(userId, windowedMessages),
    ]);
    const modelMessages = await convertToModelMessages(preparedMessages);

    const result = streamText({
      model: getChatModel(apiKey),
      system,
      messages: modelMessages,
      tools: createChatTools({ userId, messages }),
      // Allow tool loops for receipt search/export/corrections.
      stopWhen: stepCountIs(6),
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      onFinish: ({ totalUsage }) => {
        // Don't await DB work here — AI SDK holds the stream open until onFinish
        // resolves, which leaves the client send button stuck in "streaming".
        const chatUsage: TokenReservation = {
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
          totalTokens:
            totalUsage.totalTokens ??
            (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0),
        };
        after(async () => {
          try {
            await reconcileReservedTokenUsage(userId, reservation, chatUsage);
          } catch (error) {
            console.error("Failed to reconcile token usage:", error);
          }
        });
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: ({ messages: completedMessages }) => {
        if (!isChatPersistenceConfigured()) {
          return;
        }

        // Persist after the UI stream closes so status returns to ready promptly.
        after(async () => {
          try {
            const syncResult = await syncNewReceiptsFromMessages(
              userId,
              completedMessages,
              {
                maxNewExtractions: MAX_NEW_EXTRACTIONS_PER_REQUEST,
                apiKey,
              },
            );
            // Extractions were not in the chat reservation; bill them separately.
            if (syncResult.extractedCount > 0) {
              await addUserTokenUsage(userId, {
                ...syncResult.usage,
                skipRequestIncrement: true,
              });
            }
            await replaceMessagesByUser(userId, completedMessages, chatId);
          } catch (error) {
            console.error("Failed to persist chat messages:", error);
          }
        });
      },
    });
  } catch (error) {
    console.error("Chat route failed:", error);
    return new Response(
      "Unable to generate a reply right now. Check your OpenAI API key and try again.",
      { status: 500 },
    );
  }
}
