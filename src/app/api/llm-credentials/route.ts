import { auth } from "@clerk/nextjs/server";
import {
  deleteUserLlmCredentials,
  getUserLlmCredentialStatus,
  isLlmCredentialsConfigured,
  isPlausibleOpenAiApiKey,
  isPlausibleUserEncryptionKey,
  MIN_USER_ENCRYPTION_KEY_LENGTH,
  normalizeOpenAiApiKey,
  saveUserOpenAiApiKey,
  verifyOpenAiApiKey,
  type UserLlmCredentialStatus,
} from "@/lib/llm-credentials-store";
import {
  clearLlmUnlockSession,
  isLlmSessionUnlocked,
  setLlmUnlockSession,
} from "@/lib/llm-unlock-session";
import { normalizeUserEncryptionKey } from "@/lib/crypto-secrets";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isLlmCredentialsConfigured()) {
    return Response.json(
      {
        configured: false,
        unlocked: false,
        provider: null,
        keyLastFour: null,
        updatedAt: null,
        storageReady: false,
      } satisfies UserLlmCredentialStatus & { storageReady: boolean },
      { status: 503 },
    );
  }

  const unlocked = await isLlmSessionUnlocked(userId);
  const status = await getUserLlmCredentialStatus(userId, unlocked);
  return Response.json({ ...status, storageReady: true });
}

type PutBody = {
  apiKey?: string;
  encryptionKey?: string;
};

export async function PUT(request: Request) {
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

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const apiKey =
    typeof body.apiKey === "string" ? normalizeOpenAiApiKey(body.apiKey) : "";
  const encryptionKey =
    typeof body.encryptionKey === "string"
      ? normalizeUserEncryptionKey(body.encryptionKey)
      : "";

  if (!apiKey) {
    return new Response("API key is required.", { status: 400 });
  }

  if (!isPlausibleOpenAiApiKey(apiKey)) {
    return new Response(
      "That does not look like a valid OpenAI API key (expected sk-…).",
      { status: 400 },
    );
  }

  if (!encryptionKey) {
    return new Response("Encryption key is required.", { status: 400 });
  }

  if (!isPlausibleUserEncryptionKey(encryptionKey)) {
    return new Response(
      `Encryption key must be at least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters.`,
      { status: 400 },
    );
  }

  const isValid = await verifyOpenAiApiKey(apiKey);
  if (!isValid) {
    return new Response(
      "OpenAI rejected this API key. Check the key and try again.",
      { status: 400 },
    );
  }

  try {
    const status = await saveUserOpenAiApiKey(userId, apiKey, encryptionKey);
    await setLlmUnlockSession(userId, apiKey);
    return Response.json({ ...status, storageReady: true });
  } catch (error) {
    console.error("Failed to save LLM credentials:", error);
    return new Response("Unable to save API key.", { status: 500 });
  }
}

export async function DELETE() {
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

  try {
    await deleteUserLlmCredentials(userId);
    await clearLlmUnlockSession();
    return Response.json({
      configured: false,
      unlocked: false,
      provider: null,
      keyLastFour: null,
      updatedAt: null,
      storageReady: true,
    } satisfies UserLlmCredentialStatus & { storageReady: boolean });
  } catch (error) {
    console.error("Failed to delete LLM credentials:", error);
    return new Response("Unable to remove API key.", { status: 500 });
  }
}
