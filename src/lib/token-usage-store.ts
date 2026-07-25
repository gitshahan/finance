import { getSqlClient, isDatabaseConfigured } from "@/lib/db";

const MAX_TOTAL_TOKENS = 1_000_000;
const MAX_OUTPUT_TOKENS = 286_000;
const MAX_REQUEST_COUNT = 550;

/** Conservative pre-debit for one chat completion (input + tools + history window). */
export const CHAT_RESERVE_INPUT_TOKENS = 12_000;
/** Matches streamText maxOutputTokens in the chat route. */
export const CHAT_RESERVE_OUTPUT_TOKENS = 1_500;
/** Vision extraction is expensive; reserve before generateObject. */
export const EXTRACTION_RESERVE_INPUT_TOKENS = 7_200;
export const EXTRACTION_RESERVE_OUTPUT_TOKENS = 800;

function percentRemaining(remaining: number, max: number) {
  if (max <= 0) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round((remaining / max) * 100)));
}

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
  /** Lowest remaining % across token and request limits. */
  remainingQuotaPercent: number;
  isQuotaExceeded: boolean;
};

export type TokenReservation = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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

function toSafeInt(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.trunc(value);
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
  const remainingRequestsEstimate = Math.max(0, MAX_REQUEST_COUNT - requestCount);
  const remainingQuotaPercent = Math.min(
    percentRemaining(remainingTotalTokens, MAX_TOTAL_TOKENS),
    percentRemaining(remainingOutputTokens, MAX_OUTPUT_TOKENS),
    percentRemaining(remainingRequestsEstimate, MAX_REQUEST_COUNT),
  );
  const isQuotaExceeded =
    totalTokens >= MAX_TOTAL_TOKENS ||
    totalOutputTokens >= MAX_OUTPUT_TOKENS ||
    requestCount >= MAX_REQUEST_COUNT;

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
    remainingQuotaPercent,
    isQuotaExceeded,
  };
}

export function isTokenUsageConfigured() {
  return isDatabaseConfigured();
}

export function buildChatBudgetReservation(extractionCount: number): TokenReservation {
  const extractions = Math.max(0, Math.trunc(extractionCount));
  const inputTokens =
    CHAT_RESERVE_INPUT_TOKENS + EXTRACTION_RESERVE_INPUT_TOKENS * extractions;
  const outputTokens =
    CHAT_RESERVE_OUTPUT_TOKENS + EXTRACTION_RESERVE_OUTPUT_TOKENS * extractions;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
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

/**
 * Atomically reserve one request slot plus an estimated token budget.
 * Returns updated usage, or null if the request/token quota cannot cover the reservation.
 */
export async function tryReserveChatBudget(
  userId: string,
  reservation: TokenReservation,
): Promise<UserTokenUsage | null> {
  if (!isTokenUsageConfigured()) {
    return null;
  }

  const inputTokens = toSafeNonNegativeInt(reservation.inputTokens);
  const outputTokens = toSafeNonNegativeInt(reservation.outputTokens);
  const totalTokens = toSafeNonNegativeInt(
    reservation.totalTokens || inputTokens + outputTokens,
  );

  // INSERT path has no WHERE clause — reject impossible single-request reservations.
  if (
    totalTokens > MAX_TOTAL_TOKENS ||
    outputTokens > MAX_OUTPUT_TOKENS ||
    MAX_REQUEST_COUNT < 1
  ) {
    return null;
  }

  await ensureTokenUsageTable();
  const sql = getSqlClient();

  const rows = (await sql`
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
    WHERE user_token_usage.request_count < ${MAX_REQUEST_COUNT}
      AND user_token_usage.total_tokens + EXCLUDED.total_tokens <= ${MAX_TOTAL_TOKENS}
      AND user_token_usage.total_output_tokens + EXCLUDED.total_output_tokens <= ${MAX_OUTPUT_TOKENS}
    RETURNING
      user_id,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      request_count
  `) as UserTokenUsageRow[];

  if (rows.length === 0) {
    return null;
  }

  return buildUsageSummary(userId, rows[0]!);
}

/**
 * Adjust counters from a prior reservation to actual usage (delta may be negative).
 * Does not change request_count.
 */
export async function reconcileReservedTokenUsage(
  userId: string,
  reserved: TokenReservation,
  actual: TokenReservation,
) {
  if (!isTokenUsageConfigured()) {
    return;
  }

  const inputDelta =
    toSafeNonNegativeInt(actual.inputTokens) - toSafeNonNegativeInt(reserved.inputTokens);
  const outputDelta =
    toSafeNonNegativeInt(actual.outputTokens) -
    toSafeNonNegativeInt(reserved.outputTokens);
  const totalDelta =
    toSafeNonNegativeInt(actual.totalTokens) - toSafeNonNegativeInt(reserved.totalTokens);

  if (inputDelta === 0 && outputDelta === 0 && totalDelta === 0) {
    return;
  }

  await ensureTokenUsageTable();
  const sql = getSqlClient();

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
      ${Math.max(0, toSafeInt(actual.inputTokens))},
      ${Math.max(0, toSafeInt(actual.outputTokens))},
      ${Math.max(0, toSafeInt(actual.totalTokens))},
      0
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_input_tokens = GREATEST(
        0,
        user_token_usage.total_input_tokens + ${inputDelta}
      ),
      total_output_tokens = GREATEST(
        0,
        user_token_usage.total_output_tokens + ${outputDelta}
      ),
      total_tokens = GREATEST(
        0,
        user_token_usage.total_tokens + ${totalDelta}
      ),
      updated_at = NOW()
  `;
}

export async function addUserTokenUsage(
  userId: string,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    /** When true, do not increment request_count (already reserved). */
    skipRequestIncrement?: boolean;
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
  const requestIncrement = usage.skipRequestIncrement ? 0 : 1;

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
      ${requestIncrement}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_input_tokens = user_token_usage.total_input_tokens + EXCLUDED.total_input_tokens,
      total_output_tokens = user_token_usage.total_output_tokens + EXCLUDED.total_output_tokens,
      total_tokens = user_token_usage.total_tokens + EXCLUDED.total_tokens,
      request_count = user_token_usage.request_count + EXCLUDED.request_count,
      updated_at = NOW()
  `;
}
