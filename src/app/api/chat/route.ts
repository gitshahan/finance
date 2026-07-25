import { auth } from "@clerk/nextjs/server";
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
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
import { CHAT_MODEL } from "@/lib/ai-model";
import { createChatTools } from "@/lib/chat-tools";

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

function emptyUsage(): TokenReservation {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(a: TokenReservation, b: TokenReservation): TokenReservation {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
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

    let extractionUsage = emptyUsage();
    let extractionsRemaining = MAX_NEW_EXTRACTIONS_PER_REQUEST;

    if (isChatPersistenceConfigured()) {
      const syncResult = await syncNewReceiptsFromMessages(userId, messages, {
        maxNewExtractions: extractionsRemaining,
      });
      extractionUsage = addUsage(extractionUsage, syncResult.usage);
      extractionsRemaining = Math.max(
        0,
        extractionsRemaining - syncResult.extractedCount,
      );
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
      stopWhen: stepCountIs(8),
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      onFinish: async ({ totalUsage }) => {
        const chatUsage: TokenReservation = {
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
          totalTokens:
            totalUsage.totalTokens ??
            (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0),
        };
        await reconcileReservedTokenUsage(
          userId,
          reservation,
          addUsage(chatUsage, extractionUsage),
        );
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
          if (extractionsRemaining > 0) {
            const syncResult = await syncNewReceiptsFromMessages(
              userId,
              completedMessages,
              { maxNewExtractions: extractionsRemaining },
            );
            // Late extractions were not in the pre-debit; bill them separately.
            if (syncResult.extractedCount > 0) {
              await addUserTokenUsage(userId, {
                ...syncResult.usage,
                skipRequestIncrement: true,
              });
            }
          }
          await replaceMessagesByUser(userId, completedMessages, chatId);
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
