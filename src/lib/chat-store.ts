import { neon } from "@neondatabase/serverless";
import type { UIMessage } from "ai";
import { deleteOrphanedReceiptBlobs } from "@/lib/receipt-blob";

const CHAT_ID = "default";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  return databaseUrl;
}

function getSqlClient() {
  return neon(getDatabaseUrl());
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
}

export async function loadMessagesByUser(userId: string): Promise<UIMessage[]> {
  await ensureChatTable();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT message_json
    FROM chat_messages
    WHERE user_id = ${userId}
      AND chat_id = ${CHAT_ID}
    ORDER BY created_at ASC
  `) as Array<{ message_json: UIMessage }>;

  return rows.map((row) => row.message_json);
}

export async function replaceMessagesByUser(
  userId: string,
  messages: UIMessage[],
) {
  await ensureChatTable();
  const sql = getSqlClient();
  const previousMessages = await loadMessagesByUser(userId);

  await sql`BEGIN`;

  try {
    await sql`
      DELETE FROM chat_messages
      WHERE user_id = ${userId}
        AND chat_id = ${CHAT_ID}
    `;

    for (const [index, message] of messages.entries()) {
      await sql`
        INSERT INTO chat_messages (user_id, chat_id, message_id, message_json, created_at)
        VALUES (
          ${userId},
          ${CHAT_ID},
          ${message.id},
          ${JSON.stringify(message)}::jsonb,
          NOW() + (${index} * INTERVAL '1 millisecond')
        )
      `;
    }

    await sql`COMMIT`;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }

  await deleteOrphanedReceiptBlobs(userId, previousMessages, messages);
}
