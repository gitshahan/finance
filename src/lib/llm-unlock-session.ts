import { cookies } from "next/headers";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secrets";
import {
  getUserLlmCredentialStatus,
  isLlmCredentialsConfigured,
} from "@/lib/llm-credentials-store";

export const LLM_UNLOCK_COOKIE = "finance_llm_unlock";

/** Session length for unlocked API key (browser cookie). */
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

type UnlockPayload = {
  userId: string;
  apiKey: string;
  expiresAt: number;
};

export type ReadyOpenAiApiKeyResult =
  | { ok: true; apiKey: string }
  | {
      ok: false;
      reason: "storage_unavailable" | "not_configured" | "locked";
    };

function serializeUnlock(payload: UnlockPayload) {
  return encryptSecret(JSON.stringify(payload));
}

function parseUnlock(raw: string): UnlockPayload | null {
  try {
    const parsed = JSON.parse(decryptSecret(raw)) as UnlockPayload;
    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.apiKey !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setLlmUnlockSession(userId: string, apiKey: string) {
  const jar = await cookies();
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  const value = serializeUnlock({ userId, apiKey, expiresAt });

  jar.set(LLM_UNLOCK_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  });
}

export async function clearLlmUnlockSession() {
  const jar = await cookies();
  jar.delete(LLM_UNLOCK_COOKIE);
}

export async function getUnlockedOpenAiApiKey(
  userId: string,
): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(LLM_UNLOCK_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const payload = parseUnlock(raw);
  if (!payload || payload.userId !== userId) {
    return null;
  }

  if (payload.expiresAt < Date.now()) {
    jar.delete(LLM_UNLOCK_COOKIE);
    return null;
  }

  return payload.apiKey;
}

export async function isLlmSessionUnlocked(userId: string) {
  return Boolean(await getUnlockedOpenAiApiKey(userId));
}

/**
 * Resolve a usable OpenAI key only when the user has saved credentials in the
 * database AND unlocked this browser session. Clears stale unlock cookies when
 * no saved key exists (e.g. returning users who never finished setup).
 */
export async function resolveReadyOpenAiApiKey(
  userId: string,
): Promise<ReadyOpenAiApiKeyResult> {
  if (!isLlmCredentialsConfigured()) {
    await clearLlmUnlockSession();
    return { ok: false, reason: "storage_unavailable" };
  }

  const status = await getUserLlmCredentialStatus(userId, false);
  if (!status.configured) {
    await clearLlmUnlockSession();
    return { ok: false, reason: "not_configured" };
  }

  const apiKey = await getUnlockedOpenAiApiKey(userId);
  if (!apiKey) {
    return { ok: false, reason: "locked" };
  }

  return { ok: true, apiKey };
}

/** Load credential status for UI. Does not mutate cookies (safe in Server Components). */
export async function loadUserLlmCredentialStatus(userId: string) {
  if (!isLlmCredentialsConfigured()) {
    return getUserLlmCredentialStatus(userId, false);
  }

  const saved = await getUserLlmCredentialStatus(userId, false);
  if (!saved.configured) {
    return saved;
  }

  const unlocked = await isLlmSessionUnlocked(userId);
  return getUserLlmCredentialStatus(userId, unlocked);
}
