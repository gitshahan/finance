import type { UIMessage } from "ai";
import { getSqlClient, isDatabaseConfigured } from "@/lib/db";
import { extractReceiptBlobUrls } from "@/lib/receipt-blob";
import { countSharedReceiptsBySourceUrl } from "@/lib/shared-data-store";

export const DEFAULT_CHAT_ID = "default";

export type ChatThread = {
  chatId: string;
  title: string;
  updatedAt: string;
};

export function isChatPersistenceConfigured() {
  return isDatabaseConfigured();
}

export function isValidChatId(chatId: string) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(chatId);
}

export async function ensureChatTable() {
  const sql = getSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, chat_id, message_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chat_threads (
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, chat_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS chat_threads_user_updated_idx
    ON chat_threads (user_id, updated_at DESC)
  `;
}

async function ensureThreadRow(
  userId: string,
  chatId: string,
  title = "New chat",
) {
  const sql = getSqlClient();

  await sql`
    INSERT INTO chat_threads (user_id, chat_id, title, updated_at)
    VALUES (${userId}, ${chatId}, ${title}, NOW())
    ON CONFLICT (user_id, chat_id) DO NOTHING
  `;
}

function titleFromMessages(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type === "text" && part.text?.trim()) {
        const text = part.text.trim().replace(/\s+/g, " ");
        return text.length > 48 ? `${text.slice(0, 45)}…` : text;
      }
    }
  }

  return null;
}

export async function listChatsByUser(userId: string): Promise<ChatThread[]> {
  if (!isChatPersistenceConfigured()) {
    return [
      {
        chatId: DEFAULT_CHAT_ID,
        title: "New chat",
        updatedAt: new Date(0).toISOString(),
      },
    ];
  }

  await ensureChatTable();
  const sql = getSqlClient();

  await ensureThreadRow(userId, DEFAULT_CHAT_ID);

  // Backfill threads for any legacy message rows without a thread record.
  await sql`
    INSERT INTO chat_threads (user_id, chat_id, title, updated_at)
    SELECT
      user_id,
      chat_id,
      'New chat',
      MAX(created_at)
    FROM chat_messages
    WHERE user_id = ${userId}
    GROUP BY user_id, chat_id
    ON CONFLICT (user_id, chat_id) DO NOTHING
  `;

  const rows = (await sql`
    SELECT chat_id, title, updated_at
    FROM chat_threads
    WHERE user_id = ${userId}
    ORDER BY
      CASE WHEN chat_id = ${DEFAULT_CHAT_ID} THEN 0 ELSE 1 END,
      updated_at DESC
  `) as Array<{ chat_id: string; title: string; updated_at: string }>;

  return rows.map((row) => ({
    chatId: row.chat_id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

export async function createChatForUser(
  userId: string,
  title = "New chat",
): Promise<ChatThread> {
  await ensureChatTable();
  const sql = getSqlClient();
  const chatId = `chat_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

  await sql`
    INSERT INTO chat_threads (user_id, chat_id, title, updated_at)
    VALUES (${userId}, ${chatId}, ${title}, NOW())
  `;

  return {
    chatId,
    title,
    updatedAt: new Date().toISOString(),
  };
}

export async function renameChatForUser(
  userId: string,
  chatId: string,
  title: string,
): Promise<ChatThread | null> {
  if (!isValidChatId(chatId)) {
    return null;
  }

  await ensureChatTable();
  const sql = getSqlClient();
  const nextTitle = title.trim().slice(0, 80) || "New chat";

  const rows = (await sql`
    UPDATE chat_threads
    SET title = ${nextTitle}, updated_at = NOW()
    WHERE user_id = ${userId}
      AND chat_id = ${chatId}
    RETURNING chat_id, title, updated_at
  `) as Array<{ chat_id: string; title: string; updated_at: string }>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export async function deleteChatForUser(userId: string, chatId: string) {
  if (!isValidChatId(chatId) || chatId === DEFAULT_CHAT_ID) {
    return { ok: false as const, error: "Cannot delete this chat." };
  }

  await ensureChatTable();
  const sql = getSqlClient();
  const previousMessages = await loadMessagesByUser(userId, chatId);

  await sql.transaction([
    sql`
      DELETE FROM chat_messages
      WHERE user_id = ${userId}
        AND chat_id = ${chatId}
    `,
    sql`
      DELETE FROM chat_threads
      WHERE user_id = ${userId}
        AND chat_id = ${chatId}
    `,
  ]);

  // Only delete blobs that are not referenced in any remaining chat.
  const allThreads = await listChatsByUser(userId);
  const remainingUrls = new Set<string>();

  for (const thread of allThreads) {
    const messages = await loadMessagesByUser(userId, thread.chatId);
    for (const url of extractReceiptBlobUrls(messages, userId)) {
      remainingUrls.add(url);
    }
  }

  const previousUrls = extractReceiptBlobUrls(previousMessages, userId);
  const candidateOrphans = previousUrls.filter((url) => !remainingUrls.has(url));

  // Keep account-wide receipt index; only delete blobs not referenced by index.
  if (process.env.BLOB_READ_WRITE_TOKEN && candidateOrphans.length > 0) {
    const { del } = await import("@vercel/blob");
    await Promise.all(
      candidateOrphans.map(async (url) => {
        const indexed = await countSharedReceiptsBySourceUrl(userId, url);
        if (indexed > 0) {
          return;
        }

        try {
          await del(url);
        } catch (error) {
          console.error("Failed to delete orphaned receipt blob:", url, error);
        }
      }),
    );
  }

  return { ok: true as const };
}

export async function loadMessagesByUser(
  userId: string,
  chatId: string = DEFAULT_CHAT_ID,
): Promise<UIMessage[]> {
  if (!isChatPersistenceConfigured()) {
    return [];
  }

  if (!isValidChatId(chatId)) {
    return [];
  }

  await ensureChatTable();
  await ensureThreadRow(userId, chatId);
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT message_json
    FROM chat_messages
    WHERE user_id = ${userId}
      AND chat_id = ${chatId}
    ORDER BY created_at ASC
  `) as Array<{ message_json: UIMessage }>;

  return rows.map((row) => row.message_json);
}

function restoreMissingServerFileParts(
  clientMessage: UIMessage,
  serverMessage: UIMessage,
): UIMessage {
  const clientFileUrls = new Set(
    clientMessage.parts
      .filter((part) => part.type === "file" && part.url)
      .map((part) => (part as { url: string }).url),
  );

  const missingServerFileParts = serverMessage.parts.filter(
    (part) =>
      part.type === "file" && part.url && !clientFileUrls.has(part.url),
  );

  if (missingServerFileParts.length === 0) {
    return clientMessage;
  }

  return {
    ...clientMessage,
    parts: [...clientMessage.parts, ...missingServerFileParts],
  };
}

/**
 * Merge client messages with server history so a truncated/malicious client
 * payload cannot drop previously persisted messages or file attachments.
 */
export function mergeMessagesPreservingServerHistory(
  serverMessages: UIMessage[],
  clientMessages: UIMessage[],
): UIMessage[] {
  const clientById = new Map(
    clientMessages.map((message) => [message.id, message]),
  );
  const seen = new Set<string>();
  const result: UIMessage[] = [];

  for (const serverMessage of serverMessages) {
    const clientMessage = clientById.get(serverMessage.id);
    if (clientMessage) {
      result.push(restoreMissingServerFileParts(clientMessage, serverMessage));
    } else {
      result.push(serverMessage);
    }
    seen.add(serverMessage.id);
  }

  for (const clientMessage of clientMessages) {
    if (!seen.has(clientMessage.id)) {
      result.push(clientMessage);
    }
  }

  return result;
}

export async function replaceMessagesByUser(
  userId: string,
  messages: UIMessage[],
  chatId: string = DEFAULT_CHAT_ID,
) {
  if (!isValidChatId(chatId)) {
    throw new Error("Invalid chat id.");
  }

  await ensureChatTable();
  await ensureThreadRow(userId, chatId);
  const sql = getSqlClient();
  const previousMessages = await loadMessagesByUser(userId, chatId);
  const mergedMessages = mergeMessagesPreservingServerHistory(
    previousMessages,
    messages,
  );

  const derivedTitle = titleFromMessages(mergedMessages);

  const queries = [
    sql`
      DELETE FROM chat_messages
      WHERE user_id = ${userId}
        AND chat_id = ${chatId}
    `,
    ...mergedMessages.map(
      (message, index) => sql`
        INSERT INTO chat_messages (user_id, chat_id, message_id, message_json, created_at)
        VALUES (
          ${userId},
          ${chatId},
          ${message.id},
          ${JSON.stringify(message)}::jsonb,
          NOW() + (${index} * INTERVAL '1 millisecond')
        )
      `,
    ),
    sql`
      UPDATE chat_threads
      SET
        updated_at = NOW(),
        title = CASE
          WHEN title = 'New chat' AND ${derivedTitle}::text IS NOT NULL
            THEN ${derivedTitle}
          ELSE title
        END
      WHERE user_id = ${userId}
        AND chat_id = ${chatId}
    `,
  ];

  await sql.transaction(queries);

  // Orphan cleanup must consider all chats for this user, not only the active one.
  const allThreads = await listChatsByUser(userId);
  const remainingUrls = new Set<string>();

  for (const thread of allThreads) {
    const threadMessages =
      thread.chatId === chatId
        ? mergedMessages
        : await loadMessagesByUser(userId, thread.chatId);
    for (const url of extractReceiptBlobUrls(threadMessages, userId)) {
      remainingUrls.add(url);
    }
  }

  const previousUrls = new Set(extractReceiptBlobUrls(previousMessages, userId));
  const candidateOrphans = [...previousUrls].filter(
    (url) => !remainingUrls.has(url),
  );

  // Receipt index is account-wide: do not delete indexed rows when a chat drops
  // an attachment. Only remove blobs that nothing (chat or index) references.
  if (process.env.BLOB_READ_WRITE_TOKEN && candidateOrphans.length > 0) {
    const { del } = await import("@vercel/blob");
    await Promise.all(
      candidateOrphans.map(async (url) => {
        const indexed = await countSharedReceiptsBySourceUrl(userId, url);
        if (indexed > 0) {
          return;
        }

        try {
          await del(url);
        } catch (error) {
          console.error("Failed to delete orphaned receipt blob:", url, error);
        }
      }),
    );
  }
}
