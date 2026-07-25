import { getSqlClient, isDatabaseConfigured } from "@/lib/db";
import {
  inferMerchantCategory,
  normalizeMerchantKey,
  resolveMerchantCategory,
} from "@/lib/merchant-categories";
import type { ReceiptListFilters } from "@/lib/receipt-filters";

export type ReceiptSourceType = "image" | "csv";

export type SharedReceiptRecord = {
  id: string;
  userId: string;
  messageId: string | null;
  imageUrl: string;
  sourceType: ReceiptSourceType;
  sourceUrl: string;
  isReceipt: boolean;
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  summary: string | null;
  category: string | null;
  confirmed: boolean;
  details: Record<string, unknown>;
  createdAt: string;
};

type SharedReceiptRow = {
  id: string;
  user_id: string;
  message_id: string | null;
  image_url: string;
  source_type: string | null;
  source_url: string | null;
  is_receipt: boolean;
  merchant: string | null;
  receipt_date: string | null;
  total_amount: string | null;
  currency: string | null;
  payment_method: string | null;
  reference_id: string | null;
  summary: string | null;
  category: string | null;
  confirmed: boolean | null;
  details: Record<string, unknown>;
  created_at: string;
};

const MAX_RECEIPTS_IN_PROMPT = 12;
const MAX_SEARCH_TOOL_ROWS = 50;

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
    ALTER TABLE user_shared_receipts
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'image'
  `;
  await sql`
    ALTER TABLE user_shared_receipts
    ADD COLUMN IF NOT EXISTS source_url TEXT
  `;
  await sql`
    ALTER TABLE user_shared_receipts
    ADD COLUMN IF NOT EXISTS category TEXT
  `;
  await sql`
    ALTER TABLE user_shared_receipts
    ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    UPDATE user_shared_receipts
    SET source_url = image_url
    WHERE source_url IS NULL
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS user_shared_receipts_user_created_idx
    ON user_shared_receipts (user_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS user_shared_receipts_user_source_idx
    ON user_shared_receipts (user_id, source_url)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_merchant_categories (
      user_id TEXT NOT NULL,
      merchant_key TEXT NOT NULL,
      category TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, merchant_key)
    )
  `;
}

function mapRow(row: SharedReceiptRow): SharedReceiptRecord {
  const sourceType: ReceiptSourceType =
    row.source_type === "csv" ? "csv" : "image";

  return {
    id: row.id,
    userId: row.user_id,
    messageId: row.message_id,
    imageUrl: row.image_url,
    sourceType,
    sourceUrl: row.source_url ?? row.image_url,
    isReceipt: row.is_receipt,
    merchant: row.merchant,
    receiptDate: row.receipt_date,
    totalAmount:
      row.total_amount === null ? null : Number.parseFloat(row.total_amount),
    currency: row.currency,
    paymentMethod: row.payment_method,
    referenceId: row.reference_id,
    summary: row.summary,
    category: row.category,
    confirmed: Boolean(row.confirmed),
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

function toPublicReceipt(receipt: SharedReceiptRecord) {
  return {
    id: receipt.id,
    sourceType: receipt.sourceType,
    isReceipt: receipt.isReceipt,
    merchant: receipt.merchant,
    receiptDate: receipt.receiptDate,
    totalAmount: receipt.totalAmount,
    currency: receipt.currency,
    paymentMethod: receipt.paymentMethod,
    referenceId: receipt.referenceId,
    summary: receipt.summary,
    category: receipt.category,
    confirmed: receipt.confirmed,
    createdAt: receipt.createdAt,
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
      source_type,
      source_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      category,
      confirmed,
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

export async function getSharedReceiptById(
  userId: string,
  id: string,
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
      source_type,
      source_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      category,
      confirmed,
      details,
      created_at
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND id = ${id}
    LIMIT 1
  `) as SharedReceiptRow[];

  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function findDuplicateSharedReceipt(
  userId: string,
  input: {
    merchant: string | null;
    receiptDate: string | null;
    totalAmount: number | null;
    currency: string | null;
  },
): Promise<SharedReceiptRecord | null> {
  if (
    !isSharedDataConfigured() ||
    !input.merchant?.trim() ||
    input.totalAmount === null ||
    !input.receiptDate
  ) {
    return null;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const merchantPattern = input.merchant.trim();
  const currency = input.currency?.trim() || null;

  const rows = (await sql`
    SELECT
      id,
      user_id,
      message_id,
      image_url,
      source_type,
      source_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      category,
      confirmed,
      details,
      created_at
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND is_receipt = TRUE
      AND merchant ILIKE ${merchantPattern}
      AND total_amount = ${input.totalAmount}
      AND (${currency}::text IS NULL OR currency ILIKE ${currency})
      AND receipt_date IS NOT NULL
      AND receipt_date::date = ${input.receiptDate}::date
    ORDER BY created_at ASC
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
  const category = filters.category?.trim() || null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const receiptsOnly = filters.receiptsOnly === true;
  const searchPattern = search ? `%${search}%` : null;
  const merchantPattern = merchant ? `%${merchant}%` : null;
  const categoryPattern = category ? `%${category}%` : null;

  const rows = (await sql`
    SELECT
      id,
      user_id,
      message_id,
      image_url,
      source_type,
      source_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      category,
      confirmed,
      details,
      created_at
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND (${receiptsOnly} = FALSE OR is_receipt = TRUE)
      AND (${merchantPattern}::text IS NULL OR merchant ILIKE ${merchantPattern})
      AND (${categoryPattern}::text IS NULL OR category ILIKE ${categoryPattern})
      AND (
        ${searchPattern}::text IS NULL
        OR merchant ILIKE ${searchPattern}
        OR summary ILIKE ${searchPattern}
        OR reference_id ILIKE ${searchPattern}
        OR payment_method ILIKE ${searchPattern}
        OR category ILIKE ${searchPattern}
      )
      AND (${dateFrom}::timestamptz IS NULL OR receipt_date >= ${dateFrom}::timestamptz)
      AND (
        ${dateTo}::date IS NULL
        OR receipt_date < (${dateTo}::date + INTERVAL '1 day')
      )
    ORDER BY COALESCE(receipt_date, created_at) DESC, created_at DESC
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
  const category = filters.category?.trim() || null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const receiptsOnly = filters.receiptsOnly === true;
  const searchPattern = search ? `%${search}%` : null;
  const merchantPattern = merchant ? `%${merchant}%` : null;
  const categoryPattern = category ? `%${category}%` : null;

  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND (${receiptsOnly} = FALSE OR is_receipt = TRUE)
      AND (${merchantPattern}::text IS NULL OR merchant ILIKE ${merchantPattern})
      AND (${categoryPattern}::text IS NULL OR category ILIKE ${categoryPattern})
      AND (
        ${searchPattern}::text IS NULL
        OR merchant ILIKE ${searchPattern}
        OR summary ILIKE ${searchPattern}
        OR reference_id ILIKE ${searchPattern}
        OR payment_method ILIKE ${searchPattern}
        OR category ILIKE ${searchPattern}
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
  sourceType?: ReceiptSourceType;
  sourceUrl?: string;
  isReceipt: boolean;
  merchant: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  summary: string | null;
  category?: string | null;
  confirmed?: boolean;
  details: Record<string, unknown>;
};

export async function insertSharedReceipt(input: InsertSharedReceiptInput) {
  if (!isSharedDataConfigured()) {
    return;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const sourceType = input.sourceType ?? "image";
  const sourceUrl = input.sourceUrl ?? input.imageUrl;
  const category =
    input.category ??
    (await getMerchantCategoryForUser(input.userId, input.merchant)) ??
    inferMerchantCategory(input.merchant);

  await sql`
    INSERT INTO user_shared_receipts (
      id,
      user_id,
      message_id,
      image_url,
      source_type,
      source_url,
      is_receipt,
      merchant,
      receipt_date,
      total_amount,
      currency,
      payment_method,
      reference_id,
      summary,
      category,
      confirmed,
      details
    )
    VALUES (
      ${input.id},
      ${input.userId},
      ${input.messageId},
      ${input.imageUrl},
      ${sourceType},
      ${sourceUrl},
      ${input.isReceipt},
      ${input.merchant},
      ${input.receiptDate},
      ${input.totalAmount},
      ${input.currency},
      ${input.paymentMethod},
      ${input.referenceId},
      ${input.summary},
      ${category},
      ${input.confirmed ?? false},
      ${JSON.stringify(input.details)}::jsonb
    )
    ON CONFLICT (user_id, image_url) DO UPDATE SET
      message_id = EXCLUDED.message_id,
      source_type = EXCLUDED.source_type,
      source_url = EXCLUDED.source_url,
      is_receipt = EXCLUDED.is_receipt,
      merchant = EXCLUDED.merchant,
      receipt_date = EXCLUDED.receipt_date,
      total_amount = EXCLUDED.total_amount,
      currency = EXCLUDED.currency,
      payment_method = EXCLUDED.payment_method,
      reference_id = EXCLUDED.reference_id,
      summary = EXCLUDED.summary,
      category = COALESCE(EXCLUDED.category, user_shared_receipts.category),
      confirmed = EXCLUDED.confirmed,
      details = EXCLUDED.details
  `;
}

export type UpdateSharedReceiptInput = {
  merchant?: string | null;
  receiptDate?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  paymentMethod?: string | null;
  referenceId?: string | null;
  summary?: string | null;
  category?: string | null;
  confirmed?: boolean;
  isReceipt?: boolean;
};

export async function updateSharedReceipt(
  userId: string,
  id: string,
  patch: UpdateSharedReceiptInput,
): Promise<SharedReceiptRecord | null> {
  const existing = await getSharedReceiptById(userId, id);
  if (!existing) {
    return null;
  }

  const next: InsertSharedReceiptInput = {
    id: existing.id,
    userId: existing.userId,
    messageId: existing.messageId,
    imageUrl: existing.imageUrl,
    sourceType: existing.sourceType,
    sourceUrl: existing.sourceUrl,
    isReceipt: patch.isReceipt ?? existing.isReceipt,
    merchant: patch.merchant !== undefined ? patch.merchant : existing.merchant,
    receiptDate:
      patch.receiptDate !== undefined ? patch.receiptDate : existing.receiptDate,
    totalAmount:
      patch.totalAmount !== undefined ? patch.totalAmount : existing.totalAmount,
    currency: patch.currency !== undefined ? patch.currency : existing.currency,
    paymentMethod:
      patch.paymentMethod !== undefined
        ? patch.paymentMethod
        : existing.paymentMethod,
    referenceId:
      patch.referenceId !== undefined ? patch.referenceId : existing.referenceId,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    category: patch.category !== undefined ? patch.category : existing.category,
    confirmed: patch.confirmed ?? existing.confirmed,
    details: existing.details,
  };

  await insertSharedReceipt(next);
  return getSharedReceiptById(userId, id);
}

export async function deleteSharedReceiptById(userId: string, id: string) {
  if (!isSharedDataConfigured()) {
    return null;
  }

  const existing = await getSharedReceiptById(userId, id);
  if (!existing) {
    return null;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  await sql`
    DELETE FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND id = ${id}
  `;

  return existing;
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
        AND (
          image_url = ${imageUrl}
          OR source_url = ${imageUrl}
        )
    `;
  }
}

export async function countSharedReceiptsBySourceUrl(
  userId: string,
  sourceUrl: string,
): Promise<number> {
  if (!isSharedDataConfigured()) {
    return 0;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND (
        image_url = ${sourceUrl}
        OR source_url = ${sourceUrl}
      )
  `) as Array<{ count: number }>;

  return rows[0]?.count ?? 0;
}

export async function getMerchantCategoryForUser(
  userId: string,
  merchant: string | null | undefined,
): Promise<string | null> {
  const key = normalizeMerchantKey(merchant);
  if (!key || !isSharedDataConfigured()) {
    return null;
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT category
    FROM user_merchant_categories
    WHERE user_id = ${userId}
      AND merchant_key = ${key}
    LIMIT 1
  `) as Array<{ category: string }>;

  return rows[0]?.category ?? null;
}

export async function setMerchantCategoryForUser(
  userId: string,
  merchant: string,
  category: string,
): Promise<{ merchantKey: string; category: string; updatedCount: number }> {
  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const merchantKey = normalizeMerchantKey(merchant);
  const nextCategory = category.trim();

  if (!merchantKey || !nextCategory) {
    throw new Error("Merchant and category are required.");
  }

  await sql`
    INSERT INTO user_merchant_categories (user_id, merchant_key, category, updated_at)
    VALUES (${userId}, ${merchantKey}, ${nextCategory}, NOW())
    ON CONFLICT (user_id, merchant_key) DO UPDATE SET
      category = EXCLUDED.category,
      updated_at = NOW()
  `;

  const updated = (await sql`
    UPDATE user_shared_receipts
    SET category = ${nextCategory}
    WHERE user_id = ${userId}
      AND merchant ILIKE ${merchantKey}
    RETURNING id
  `) as Array<{ id: string }>;

  return {
    merchantKey,
    category: nextCategory,
    updatedCount: updated.length,
  };
}

export type SpendGroupBy = "merchant" | "category" | "month";

export type SpendSummaryBucket = {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
  currency: string | null;
};

export type SpendSummaryResult = {
  groupBy: SpendGroupBy;
  buckets: SpendSummaryBucket[];
  receiptCount: number;
  totalAmount: number | null;
  currency: string | null;
  filters: ReceiptListFilters;
};

export async function summarizeSharedReceiptSpend(
  userId: string,
  groupBy: SpendGroupBy,
  filters: ReceiptListFilters = {},
): Promise<SpendSummaryResult> {
  if (!isSharedDataConfigured()) {
    return {
      groupBy,
      buckets: [],
      receiptCount: 0,
      totalAmount: null,
      currency: null,
      filters,
    };
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();
  const search = filters.search?.trim() || null;
  const merchant = filters.merchant?.trim() || null;
  const category = filters.category?.trim() || null;
  const dateFrom = filters.dateFrom?.trim() || null;
  const dateTo = filters.dateTo?.trim() || null;
  const searchPattern = search ? `%${search}%` : null;
  const merchantPattern = merchant ? `%${merchant}%` : null;
  const categoryPattern = category ? `%${category}%` : null;

  const groupExpression =
    groupBy === "month"
      ? `TO_CHAR(COALESCE(receipt_date, created_at), 'YYYY-MM')`
      : groupBy === "category"
        ? `COALESCE(NULLIF(category, ''), 'Uncategorized')`
        : `COALESCE(NULLIF(merchant, ''), 'Unknown merchant')`;

  const rows = (await sql.query(
    `
      SELECT
        ${groupExpression} AS bucket_key,
        COUNT(*)::int AS count,
        COALESCE(SUM(total_amount), 0)::float AS total_amount,
        MAX(currency) AS currency
      FROM user_shared_receipts
      WHERE user_id = $1
        AND is_receipt = TRUE
        AND ($2::text IS NULL OR merchant ILIKE $2)
        AND ($3::text IS NULL OR category ILIKE $3)
        AND (
          $4::text IS NULL
          OR merchant ILIKE $4
          OR summary ILIKE $4
          OR reference_id ILIKE $4
          OR payment_method ILIKE $4
          OR category ILIKE $4
        )
        AND ($5::timestamptz IS NULL OR receipt_date >= $5::timestamptz)
        AND (
          $6::date IS NULL
          OR receipt_date < ($6::date + INTERVAL '1 day')
        )
      GROUP BY 1
      ORDER BY total_amount DESC NULLS LAST, bucket_key ASC
      LIMIT 40
    `,
    [
      userId,
      merchantPattern,
      categoryPattern,
      searchPattern,
      dateFrom,
      dateTo,
    ],
  )) as Array<{
    bucket_key: string;
    count: number;
    total_amount: number;
    currency: string | null;
  }>;

  const buckets: SpendSummaryBucket[] = rows.map((row) => ({
    key: row.bucket_key,
    label: row.bucket_key,
    count: row.count,
    totalAmount: Number(row.total_amount) || 0,
    currency: row.currency,
  }));

  const receiptCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const currencies = new Set(
    buckets.map((bucket) => bucket.currency).filter(Boolean),
  );
  const singleCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  const totalAmount =
    currencies.size <= 1
      ? buckets.reduce((sum, bucket) => sum + bucket.totalAmount, 0)
      : null;

  return {
    groupBy,
    buckets,
    receiptCount,
    totalAmount,
    currency: singleCurrency,
    filters,
  };
}

export type ReceiptIndexSummary = {
  totalCount: number;
  receiptCount: number;
  unconfirmedCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  topMerchants: Array<{ merchant: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
};

export async function getSharedReceiptIndexSummary(
  userId: string,
): Promise<ReceiptIndexSummary> {
  if (!isSharedDataConfigured()) {
    return {
      totalCount: 0,
      receiptCount: 0,
      unconfirmedCount: 0,
      earliestDate: null,
      latestDate: null,
      topMerchants: [],
      topCategories: [],
    };
  }

  await ensureSharedReceiptsTable();
  const sql = getSqlClient();

  const totals = (await sql`
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE is_receipt = TRUE)::int AS receipt_count,
      COUNT(*) FILTER (WHERE is_receipt = TRUE AND confirmed = FALSE)::int AS unconfirmed_count,
      MIN(receipt_date)::text AS earliest_date,
      MAX(receipt_date)::text AS latest_date
    FROM user_shared_receipts
    WHERE user_id = ${userId}
  `) as Array<{
    total_count: number;
    receipt_count: number;
    unconfirmed_count: number;
    earliest_date: string | null;
    latest_date: string | null;
  }>;

  const merchants = (await sql`
    SELECT merchant, COUNT(*)::int AS count
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND is_receipt = TRUE
      AND merchant IS NOT NULL
      AND TRIM(merchant) <> ''
    GROUP BY merchant
    ORDER BY count DESC, merchant ASC
    LIMIT 5
  `) as Array<{ merchant: string; count: number }>;

  const categories = (await sql`
    SELECT COALESCE(NULLIF(category, ''), 'Uncategorized') AS category,
           COUNT(*)::int AS count
    FROM user_shared_receipts
    WHERE user_id = ${userId}
      AND is_receipt = TRUE
    GROUP BY 1
    ORDER BY count DESC, category ASC
    LIMIT 5
  `) as Array<{ category: string; count: number }>;

  const row = totals[0];

  return {
    totalCount: row?.total_count ?? 0,
    receiptCount: row?.receipt_count ?? 0,
    unconfirmedCount: row?.unconfirmed_count ?? 0,
    earliestDate: row?.earliest_date ?? null,
    latestDate: row?.latest_date ?? null,
    topMerchants: merchants.map((item) => ({
      merchant: item.merchant,
      count: item.count,
    })),
    topCategories: categories.map((item) => ({
      category: item.category,
      count: item.count,
    })),
  };
}

export async function searchSavedReceiptsForTool(
  userId: string,
  filters: ReceiptListFilters,
) {
  const limit = Math.min(filters.limit ?? 20, MAX_SEARCH_TOOL_ROWS);
  const [receipts, totalCount] = await Promise.all([
    listSharedReceiptsForUser(userId, {
      ...filters,
      receiptsOnly: filters.receiptsOnly ?? true,
      limit,
    }),
    countSharedReceiptsForUser(userId, {
      ...filters,
      receiptsOnly: filters.receiptsOnly ?? true,
    }),
  ]);

  return {
    totalCount,
    returnedCount: receipts.length,
    truncated: totalCount > receipts.length,
    receipts: receipts.map(toPublicReceipt),
  };
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

function toDateOnly(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : value;
}

export function formatReceiptIndexSummaryForPrompt(
  summary: ReceiptIndexSummary,
): string | null {
  if (summary.totalCount === 0) {
    return null;
  }

  const lines = [
    `indexed_items=${summary.totalCount}`,
    `receipts=${summary.receiptCount}`,
    `unconfirmed=${summary.unconfirmedCount}`,
  ];

  const earliest = toDateOnly(summary.earliestDate);
  const latest = toDateOnly(summary.latestDate);
  if (earliest || latest) {
    lines.push(`date_range=${earliest ?? "?"} to ${latest ?? "?"}`);
  }

  if (summary.topMerchants.length > 0) {
    lines.push(
      `top_merchants=${summary.topMerchants
        .map((item) => `${item.merchant}(${item.count})`)
        .join(", ")}`,
    );
  }

  if (summary.topCategories.length > 0) {
    lines.push(
      `top_categories=${summary.topCategories
        .map((item) => `${item.category}(${item.count})`)
        .join(", ")}`,
    );
  }

  lines.push(
    "Use searchSavedReceipts / summarizeSpend / generateCsvDownload for details; do not invent rows.",
  );

  return lines.join("\n");
}

/** @deprecated Prefer formatReceiptIndexSummaryForPrompt for system prompts. */
export function formatSharedReceiptsForPrompt(
  receipts: SharedReceiptRecord[],
): string | null {
  if (receipts.length === 0) {
    return null;
  }

  const lines = receipts.map((receipt, index) => {
    const parts = [`${index + 1}. id=${receipt.id}`];

    if (!receipt.isReceipt) {
      parts.push("type=non-receipt");
      if (receipt.summary) {
        parts.push(`note=${receipt.summary}`);
      }
      parts.push(`shared=${toDateOnly(receipt.createdAt)}`);
      return parts.join(" | ");
    }

    if (receipt.merchant) {
      parts.push(`merchant=${receipt.merchant}`);
    }

    const date = toDateOnly(receipt.receiptDate);
    if (date) {
      parts.push(`date=${date}`);
    }

    const amount = formatAmount(receipt.totalAmount, receipt.currency);
    if (amount) {
      parts.push(`total=${amount}`);
    }

    if (receipt.category) {
      parts.push(`category=${receipt.category}`);
    }

    if (receipt.paymentMethod) {
      parts.push(`pay=${receipt.paymentMethod}`);
    }

    if (receipt.referenceId) {
      parts.push(`ref=${receipt.referenceId}`);
    }

    if (receipt.summary) {
      parts.push(`sum=${receipt.summary}`);
    }

    parts.push(`shared=${toDateOnly(receipt.createdAt)}`);
    return parts.join(" | ");
  });

  return lines.join("\n");
}

export { resolveMerchantCategory, MAX_SEARCH_TOOL_ROWS };
