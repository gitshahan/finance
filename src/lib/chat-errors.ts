import { APICallError, RetryError } from "ai";

const DEFAULT_CHAT_ERROR =
  "Unable to generate a reply right now. Please try again in a moment.";

function unwrapChatError(error: unknown): unknown {
  if (RetryError.isInstance(error)) {
    return error.lastError ?? error.errors.at(-1) ?? error;
  }
  return error;
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];

  const walk = (value: unknown, depth = 0) => {
    if (value == null || depth > 3) {
      return;
    }
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (value instanceof Error) {
      parts.push(value.message);
      if ("cause" in value) {
        walk(value.cause, depth + 1);
      }
    }
    if (APICallError.isInstance(value)) {
      if (typeof value.responseBody === "string") {
        parts.push(value.responseBody);
      }
      if (value.data && typeof value.data === "object") {
        try {
          parts.push(JSON.stringify(value.data));
        } catch {
          // ignore non-serializable payloads
        }
      }
    }
  };

  walk(error);
  return parts.join(" ").toLowerCase();
}

/**
 * Maps provider / SDK failures to short, actionable copy for the chat UI.
 * Avoid leaking raw stack traces or internal request payloads.
 */
export function toUserFacingChatError(error: unknown): string {
  const root = unwrapChatError(error);
  const text = collectErrorText(root);
  const statusCode = APICallError.isInstance(root) ? root.statusCode : undefined;

  if (
    text.includes("exceeded your current quota") ||
    text.includes("insufficient_quota") ||
    text.includes("billing details") ||
    text.includes("billing_not_active")
  ) {
    return "Your OpenAI account is out of quota or billing is not active. Check your OpenAI plan and billing, then try again.";
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    text.includes("incorrect api key") ||
    text.includes("invalid_api_key") ||
    text.includes("invalid api key") ||
    text.includes("authentication")
  ) {
    return "Your OpenAI API key was rejected. Update it in settings and unlock again.";
  }

  if (
    text.includes("model_not_found") ||
    text.includes("does not exist") ||
    text.includes("model is not available") ||
    (statusCode === 404 && text.includes("model"))
  ) {
    return "The configured chat model is not available for your OpenAI account. Ask an admin to update AI_CHAT_MODEL, or try another key with access to that model.";
  }

  if (statusCode === 429 || text.includes("rate limit") || text.includes("rate_limit")) {
    return "OpenAI rate-limited this request. Wait a moment and try again.";
  }

  if (statusCode === 400) {
    return "OpenAI rejected this request. Try a shorter message or remove the attachment and retry.";
  }

  if (
    statusCode != null &&
    statusCode >= 500 &&
    statusCode < 600
  ) {
    return "OpenAI is temporarily unavailable. Please try again shortly.";
  }

  if (
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return "Could not reach OpenAI. Check your connection and try again.";
  }

  return DEFAULT_CHAT_ERROR;
}
