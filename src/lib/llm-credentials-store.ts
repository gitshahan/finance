import { getSqlClient, isDatabaseConfigured } from "@/lib/db";
import {
  decryptWithUserKey,
  encryptWithUserKey,
  isPlausibleUserEncryptionKey,
  isSecretEncryptionConfigured,
  isUserEncryptedSecret,
  MIN_USER_ENCRYPTION_KEY_LENGTH,
  normalizeUserEncryptionKey,
} from "@/lib/crypto-secrets";

export type LlmProvider = "openai";

export type UserLlmCredentialStatus = {
  configured: boolean;
  /** True when this browser session has unlocked the stored API key. */
  unlocked: boolean;
  provider: LlmProvider | null;
  keyLastFour: string | null;
  updatedAt: string | null;
};

type LlmCredentialRow = {
  user_id: string;
  provider: string;
  encrypted_api_key: string;
  key_last_four: string;
  updated_at: string;
};

export function isLlmCredentialsConfigured() {
  return isDatabaseConfigured() && isSecretEncryptionConfigured();
}

export async function ensureLlmCredentialsTable() {
  const sql = getSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS user_llm_credentials (
      user_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      key_last_four TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function maskLastFour(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length < 4) {
    return trimmed;
  }
  return trimmed.slice(-4);
}

export function normalizeOpenAiApiKey(apiKey: string) {
  return apiKey.trim();
}

export function isPlausibleOpenAiApiKey(apiKey: string) {
  const key = normalizeOpenAiApiKey(apiKey);
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(key);
}

export { isPlausibleUserEncryptionKey, MIN_USER_ENCRYPTION_KEY_LENGTH };

/** Lightweight live check that the key is accepted by OpenAI. */
export async function verifyOpenAiApiKey(apiKey: string): Promise<boolean> {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${normalizeOpenAiApiKey(apiKey)}`,
    },
    cache: "no-store",
  });

  return response.ok;
}

export async function getUserLlmCredentialStatus(
  userId: string,
  unlocked = false,
): Promise<UserLlmCredentialStatus> {
  if (!isLlmCredentialsConfigured()) {
    return {
      configured: false,
      unlocked: false,
      provider: null,
      keyLastFour: null,
      updatedAt: null,
    };
  }

  await ensureLlmCredentialsTable();
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT user_id, provider, encrypted_api_key, key_last_four, updated_at
    FROM user_llm_credentials
    WHERE user_id = ${userId}
    LIMIT 1
  `) as LlmCredentialRow[];

  const row = rows[0];
  if (!row) {
    return {
      configured: false,
      unlocked: false,
      provider: null,
      keyLastFour: null,
      updatedAt: null,
    };
  }

  return {
    configured: true,
    unlocked,
    provider: row.provider === "openai" ? "openai" : null,
    keyLastFour: row.key_last_four,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Decrypt the stored OpenAI key with the user's encryption passphrase.
 * Returns null when missing or the passphrase is wrong.
 */
export async function decryptUserOpenAiApiKey(
  userId: string,
  encryptionKey: string,
): Promise<string | null> {
  if (!isLlmCredentialsConfigured()) {
    return null;
  }

  const passphrase = normalizeUserEncryptionKey(encryptionKey);
  if (!isPlausibleUserEncryptionKey(passphrase)) {
    return null;
  }

  await ensureLlmCredentialsTable();
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT encrypted_api_key, provider
    FROM user_llm_credentials
    WHERE user_id = ${userId}
    LIMIT 1
  `) as Pick<LlmCredentialRow, "encrypted_api_key" | "provider">[];

  const row = rows[0];
  if (!row || row.provider !== "openai") {
    return null;
  }

  if (!isUserEncryptedSecret(row.encrypted_api_key)) {
    throw new Error(
      "Stored API key uses an old format. Remove it and save again with an encryption key.",
    );
  }

  try {
    return decryptWithUserKey(row.encrypted_api_key, passphrase);
  } catch {
    return null;
  }
}

export async function saveUserOpenAiApiKey(
  userId: string,
  apiKey: string,
  encryptionKey: string,
) {
  if (!isLlmCredentialsConfigured()) {
    throw new Error("LLM credential storage is not configured.");
  }

  const normalized = normalizeOpenAiApiKey(apiKey);
  if (!isPlausibleOpenAiApiKey(normalized)) {
    throw new Error("That does not look like a valid OpenAI API key.");
  }

  const passphrase = normalizeUserEncryptionKey(encryptionKey);
  if (!isPlausibleUserEncryptionKey(passphrase)) {
    throw new Error(
      `Encryption key must be at least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters.`,
    );
  }

  await ensureLlmCredentialsTable();
  const sql = getSqlClient();
  const encrypted = encryptWithUserKey(normalized, passphrase);
  const keyLastFour = maskLastFour(normalized);

  await sql`
    INSERT INTO user_llm_credentials (
      user_id,
      provider,
      encrypted_api_key,
      key_last_four,
      updated_at
    )
    VALUES (
      ${userId},
      ${"openai"},
      ${encrypted},
      ${keyLastFour},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      encrypted_api_key = EXCLUDED.encrypted_api_key,
      key_last_four = EXCLUDED.key_last_four,
      updated_at = NOW()
  `;

  return {
    configured: true as const,
    unlocked: true as const,
    provider: "openai" as const,
    keyLastFour,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteUserLlmCredentials(userId: string) {
  if (!isLlmCredentialsConfigured()) {
    return;
  }

  await ensureLlmCredentialsTable();
  const sql = getSqlClient();
  await sql`
    DELETE FROM user_llm_credentials
    WHERE user_id = ${userId}
  `;
}
