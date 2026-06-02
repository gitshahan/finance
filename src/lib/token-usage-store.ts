import { getSqlClient, isDatabaseConfigured } from "@/lib/db";

const MAX_TOTAL_TOKENS = 1_000_000;
const MAX_OUTPUT_TOKENS = 286_000;

export type UserTokenUsage = {
  userId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  maxTotalTokens: number;
  maxOutputTokens: number;
  remainingTotalTokens: number;
  remainingOutputTokens: number;
  remainingRequestsEstimate: number;
  isQuotaExceeded: boolean;
};

type UserTokenUsageRow = {
  user_id: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_tokens: string;
  request_count: string;
};

function toSafeNonNegativeInt(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function buildUsageSummary(
  userId: string,
  row: Pick<
    UserTokenUsageRow,
    | "user_id"
    | "total_input_tokens"
    | "total_output_tokens"
    | "total_tokens"
    | "request_count"
  > | null,
): UserTokenUsage {
  const totalInputTokens = row
    ? Number.parseInt(row.total_input_tokens, 10) || 0
    : 0;
  const totalOutputTokens = row
    ? Number.parseInt(row.total_output_tokens, 10) || 0
    : 0;
  const totalTokens = row ? Number.parseInt(row.total_tokens, 10) || 0 : 0;
  const requestCount = row ? Number.parseInt(row.request_count, 10) || 0 : 0;
  const remainingTotalTokens = Math.max(0, MAX_TOTAL_TOKENS - totalTokens);
  const remainingOutputTokens = Math.max(0, MAX_OUTPUT_TOKENS - totalOutputTokens);
  const remainingRequestsEstimate = Math.max(0, 550 - requestCount);
  const isQuotaExceeded =
    totalTokens >= MAX_TOTAL_TOKENS || totalOutputTokens >= MAX_OUTPUT_TOKENS;

  return {
    userId,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    requestCount,
    maxTotalTokens: MAX_TOTAL_TOKENS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    remainingTotalTokens,
    remainingOutputTokens,
    remainingRequestsEstimate,
    isQuotaExceeded,
  };
}

export function isTokenUsageConfigured() {
  return isDatabaseConfigured();
}

export async function ensureTokenUsageTable() {
  const sql = getSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS user_token_usage (
      user_id TEXT PRIMARY KEY,
      total_input_tokens BIGINT NOT NULL DEFAULT 0,
      total_output_tokens BIGINT NOT NULL DEFAULT 0,
      total_tokens BIGINT NOT NULL DEFAULT 0,
      request_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function getUserTokenUsage(userId: string): Promise<UserTokenUsage> {
  if (!isTokenUsageConfigured()) {
    return buildUsageSummary(userId, null);
  }

  await ensureTokenUsageTable();
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT
      user_id,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      request_count
    FROM user_token_usage
    WHERE user_id = ${userId}
    LIMIT 1
  `) as UserTokenUsageRow[];

  return buildUsageSummary(userId, rows[0] ?? null);
}

export async function addUserTokenUsage(
  userId: string,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
) {
  if (!isTokenUsageConfigured()) {
    return;
  }

  await ensureTokenUsageTable();
  const sql = getSqlClient();

  const inputTokens = toSafeNonNegativeInt(usage.inputTokens);
  const outputTokens = toSafeNonNegativeInt(usage.outputTokens);
  const totalTokens = toSafeNonNegativeInt(
    usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  );

  await sql`
    INSERT INTO user_token_usage (
      user_id,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      request_count
    )
    VALUES (
      ${userId},
      ${inputTokens},
      ${outputTokens},
      ${totalTokens},
      1
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_input_tokens = user_token_usage.total_input_tokens + EXCLUDED.total_input_tokens,
      total_output_tokens = user_token_usage.total_output_tokens + EXCLUDED.total_output_tokens,
      total_tokens = user_token_usage.total_tokens + EXCLUDED.total_tokens,
      request_count = user_token_usage.request_count + 1,
      updated_at = NOW()
  `;
}
