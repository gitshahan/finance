import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import { toUserFacingChatError } from "@/lib/chat-errors";

describe("toUserFacingChatError", () => {
  it("maps OpenAI quota / billing failures", () => {
    const error = new APICallError({
      message: "You exceeded your current quota, please check your plan and billing details.",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          message: "You exceeded your current quota, please check your plan and billing details.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
      }),
      isRetryable: true,
    });

    expect(toUserFacingChatError(error)).toMatch(/out of quota|billing/i);
  });

  it("unwraps RetryError to the underlying provider failure", () => {
    const lastError = new APICallError({
      message: "You exceeded your current quota, please check your plan and billing details.",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    const error = new RetryError({
      message: "Failed after 3 attempts. Last error: You exceeded your current quota.",
      reason: "maxRetriesExceeded",
      errors: [lastError, lastError, lastError],
    });

    expect(toUserFacingChatError(error)).toMatch(/out of quota|billing/i);
  });

  it("maps invalid API key failures", () => {
    const error = new APICallError({
      message: "Incorrect API key provided",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    });

    expect(toUserFacingChatError(error)).toMatch(/api key/i);
  });

  it("maps missing model failures", () => {
    const error = new APICallError({
      message: "The requested model 'gemini-3-flash' does not exist.",
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: 400,
      responseBody: JSON.stringify({
        error: { code: "model_not_found", message: "does not exist" },
      }),
      isRetryable: false,
    });

    expect(toUserFacingChatError(error)).toMatch(/model/i);
  });

  it("returns a generic fallback for unknown errors", () => {
    expect(toUserFacingChatError(new Error("something obscure"))).toMatch(
      /unable to generate a reply/i,
    );
  });
});
