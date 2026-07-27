import { auth } from "@clerk/nextjs/server";
import { normalizeUserEncryptionKey } from "@/lib/crypto-secrets";
import {
  decryptUserOpenAiApiKey,
  getUserLlmCredentialStatus,
  isLlmCredentialsConfigured,
  isPlausibleUserEncryptionKey,
  MIN_USER_ENCRYPTION_KEY_LENGTH,
  type UserLlmCredentialStatus,
} from "@/lib/llm-credentials-store";
import {
  clearLlmUnlockSession,
  setLlmUnlockSession,
} from "@/lib/llm-unlock-session";

type UnlockBody = {
  encryptionKey?: string;
};

export async function POST(request: Request) {
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

  let body: UnlockBody;
  try {
    body = (await request.json()) as UnlockBody;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const encryptionKey =
    typeof body.encryptionKey === "string"
      ? normalizeUserEncryptionKey(body.encryptionKey)
      : "";

  if (!encryptionKey) {
    return new Response("Encryption key is required.", { status: 400 });
  }

  if (!isPlausibleUserEncryptionKey(encryptionKey)) {
    return new Response(
      `Encryption key must be at least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters.`,
      { status: 400 },
    );
  }

  try {
    const apiKey = await decryptUserOpenAiApiKey(userId, encryptionKey);

    if (!apiKey) {
      return new Response(
        "Wrong encryption key, or no API key is saved for this account.",
        { status: 403 },
      );
    }

    await setLlmUnlockSession(userId, apiKey);
    const status = await getUserLlmCredentialStatus(userId, true);
    return Response.json({ ...status, storageReady: true });
  } catch (error) {
    console.error("Failed to unlock LLM credentials:", error);
    const message =
      error instanceof Error ? error.message : "Unable to unlock API key.";
    return new Response(message, { status: 400 });
  }
}

/** Lock this browser session without deleting the stored encrypted key. */
export async function DELETE() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  await clearLlmUnlockSession();
  const status = isLlmCredentialsConfigured()
    ? await getUserLlmCredentialStatus(userId, false)
    : ({
        configured: false,
        unlocked: false,
        provider: null,
        keyLastFour: null,
        updatedAt: null,
      } satisfies UserLlmCredentialStatus);

  return Response.json({ ...status, storageReady: isLlmCredentialsConfigured() });
}
