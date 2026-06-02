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
      className="assistant-message space-y-3 text-sm leading-relaxed [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-100 [&_h4]:mt-2 [&_h4]:text-sm [&_h4]:font-medium [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p+p]:mt-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_td]:border-t [&_td]:border-zinc-200 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-zinc-300 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium [&_thead]:bg-zinc-200/60 dark:[&_td]:border-zinc-700 dark:[&_th]:border-zinc-600 dark:[&_thead]:bg-zinc-700/40 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
