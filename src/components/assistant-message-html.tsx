"use client";

import DOMPurify from "isomorphic-dompurify";
import {
  assistantHtmlSanitizeOptions,
  normalizeAssistantHtml,
} from "@/lib/format-assistant-html";

type AssistantMessageHtmlProps = {
  html: string;
};

export function AssistantMessageHtml({ html }: AssistantMessageHtmlProps) {
  const sanitizedHtml = DOMPurify.sanitize(
    normalizeAssistantHtml(html),
    assistantHtmlSanitizeOptions,
  );

  return (
    <div
      className="prose-chat"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
