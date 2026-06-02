import { getSqlClient, isDatabaseConfigured } from "@/lib/db";
import type { ReceiptListFilters } from "@/lib/receipt-filters";

export type SharedReceiptRecord = {
  id: string;
  userId: string;
  messageId: string | null;
  imageUrl: string;
  isReceipt: boolean;
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

type SharedReceiptRow = {
  id: string;
  user_id: string;
  message_id: string | null;
  image_url: string;
  is_receipt: boolean;
  merchant: string | null;
  receipt_date: string | null;
  total_amount: string | null;
  currency: string | null;
  payment_method: string | null;
  reference_id: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const MAX_RECEIPTS_IN_PROMPT = 100;

export function isSharedDataConfigured() {
  return isDatabaseConfigured();
}

export async function ensureSharedReceiptsTable() {
  const sql = getSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS user_shared_receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_id TEXT,
      image_url TEXT NOT NULL,
      is_receipt BOOLEAN NOT NULL DEFAULT TRUE,
      merchant TEXT,
      receipt_date TIMESTAMPTZ,
      total_amount NUMERIC,
      currency TEXT,
      payment_method TEXT,
      reference_id TEXT,
      summary TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, image_url)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS user_shared_receipts_user_created_idx
    ON user_shared_receipts (user_id, created_at DESC)
  `;
}

function mapRow(row: SharedReceiptRow): SharedReceiptRecord {
  return {
    id: row.id,
    userId: row.user_id,
    messageId: row.message_id,
    imageUrl: row.image_url,
    isReceipt: row.is_receipt,
    merchant: row.merchant,
    receiptDate: row.receipt_date,
    totalAmount:
      row.total_amount === null ? null : Number.parseFloat(row.total_amount),
    currency: row.currency,
    paymentMethod: row.payment_method,
    referenceId: row.reference_id,
    summary: row.summary,
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

export async function getSharedReceiptByImageUrl(
  userId: string,
  imageUrl: string,
): Promise<SharedReceiptRecord | null> {
  if (!isSharedDataConfigured()) {
    return null;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT
      id,
      user_id,
      message_id,
      image_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      details,
      created_at
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND image_url = ${imageUrl}
    LIMIT 1
  `) as SharedReceiptRow[];

  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function listSharedReceiptsForUser(
  userId: string,
  filters: ReceiptListFilters = {},
): Promise<SharedReceiptRecord[]> {
  if (!isSharedDataConfigured()) {
    return [];
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const limit = filters.limit ?? MAX_RECEIPTS_IN_PROMPT;
  const search = filters.search?.trim() || null;
  const merchant = filters.merchant?.trim() || null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const receiptsOnly = filters.receiptsOnly === true;
  const searchPattern = search ? `%${search}%` : null;
  const merchantPattern = merchant ? `%${merchant}%` : null;

  const rows = (await sql`
    SELECT
      id,
      user_id,
      message_id,
      image_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      details,
      created_at
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND (${receiptsOnly} = FALSE OR is_receipt = TRUE)
      AND (${merchantPattern}::text IS NULL OR merchant ILIKE ${merchantPattern})
      AND (
        ${searchPattern}::text IS NULL
        OR merchant ILIKE ${searchPattern}
        OR summary ILIKE ${searchPattern}
        OR reference_id ILIKE ${searchPattern}
        OR payment_method ILIKE ${searchPattern}
      )
      AND (${dateFrom}::timestamptz IS NULL OR receipt_date >= ${dateFrom}::timestamptz)
      AND (
        ${dateTo}::date IS NULL
        OR receipt_date < (${dateTo}::date + INTERVAL '1 day')
      )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as SharedReceiptRow[];

  return rows.map(mapRow);
}

export async function countSharedReceiptsForUser(
  userId: string,
  filters: ReceiptListFilters = {},
): Promise<number> {
  if (!isSharedDataConfigured()) {
    return 0;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const search = filters.search?.trim() || null;
  const merchant = filters.merchant?.trim() || null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const receiptsOnly = filters.receiptsOnly === true;
  const searchPattern = search ? `%${search}%` : null;
  const merchantPattern = merchant ? `%${merchant}%` : null;

  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND (${receiptsOnly} = FALSE OR is_receipt = TRUE)
      AND (${merchantPattern}::text IS NULL OR merchant ILIKE ${merchantPattern})
      AND (
        ${searchPattern}::text IS NULL
        OR merchant ILIKE ${searchPattern}
        OR summary ILIKE ${searchPattern}
        OR reference_id ILIKE ${searchPattern}
        OR payment_method ILIKE ${searchPattern}
      )
      AND (${dateFrom}::timestamptz IS NULL OR receipt_date >= ${dateFrom}::timestamptz)
      AND (
        ${dateTo}::date IS NULL
        OR receipt_date < (${dateTo}::date + INTERVAL '1 day')
      )
  `) as Array<{ count: number }>;

  return rows[0]?.count ?? 0;
}

export type InsertSharedReceiptInput = {
  id: string;
  userId: string;
  messageId: string | null;
  imageUrl: string;
  isReceipt: boolean;
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  summary: string | null;
  details: Record<string, unknown>;
};

export async function insertSharedReceipt(input: InsertSharedReceiptInput) {
  if (!isSharedDataConfigured()) {
    return;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  await sql`
    INSERT INTO user_shared_receipts (
      id,
      user_id,
      message_id,
      image_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      details
    )
    VALUES (
      ${input.id},
      ${input.userId},
      ${input.messageId},
      ${input.imageUrl},
      ${input.isReceipt},
      ${input.merchant},
      ${input.receiptDate},
      ${input.totalAmount},
      ${input.currency},
      ${input.paymentMethod},
      ${input.referenceId},
      ${input.summary},
      ${JSON.stringify(input.details)}::jsonb
    )
    ON CONFLICT (user_id, image_url) DO UPDATE SET
      message_id = EXCLUDED.message_id,
      is_receipt = EXCLUDED.is_receipt,
      merchant = EXCLUDED.merchant,
      receipt_date = EXCLUDED.receipt_date,
      total_amount = EXCLUDED.total_amount,
      currency = EXCLUDED.currency,
      payment_method = EXCLUDED.payment_method,
      reference_id = EXCLUDED.reference_id,
      summary = EXCLUDED.summary,
      details = EXCLUDED.details
  `;
}

export async function deleteSharedReceiptsByImageUrls(
  userId: string,
  imageUrls: string[],
) {
  if (!isSharedDataConfigured() || imageUrls.length === 0) {
    return;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  for (const imageUrl of imageUrls) {
    await sql`
      DELETE FROM user_shared_receipts
      WHERE user_id = ${userId}
        AND image_url = ${imageUrl}
    `;
  }
}

function formatAmount(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount === null) {
    return null;
  }

  const formatted = Number.isInteger(amount)
    ? amount.toString()
    : amount.toFixed(2);

  return currency ? `${currency} ${formatted}` : formatted;
}

export function formatSharedReceiptsForPrompt(
  receipts: SharedReceiptRecord[],
): string | null {
  if (receipts.length === 0) {
    return null;
  }

  const lines = receipts.map((receipt, index) => {
    const parts = [`${index + 1}. id=${receipt.id}`];

    if (!receipt.isReceipt) {
      parts.push("type=non-receipt image");
      if (receipt.summary) {
        parts.push(`note=${receipt.summary}`);
      }
      parts.push(`shared_at=${receipt.createdAt}`);
      return parts.join(" | ");
    }

    if (receipt.merchant) {
      parts.push(`merchant=${receipt.merchant}`);
    }

    if (receipt.receiptDate) {
      parts.push(`date=${receipt.receiptDate}`);
    }

    const amount = formatAmount(receipt.totalAmount, receipt.currency);
    if (amount) {
      parts.push(`total=${amount}`);
    }

    if (receipt.paymentMethod) {
      parts.push(`payment=${receipt.paymentMethod}`);
    }

    if (receipt.referenceId) {
      parts.push(`reference=${receipt.referenceId}`);
    }

    if (receipt.summary) {
      parts.push(`summary=${receipt.summary}`);
    }

    parts.push(`shared_at=${receipt.createdAt}`);
    return parts.join(" | ");
  });

  return lines.join("\n");
}
