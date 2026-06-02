const ALLOWED_HTML_TAGS = [
  "p",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "h3",
  "h4",
  "div",
  "span",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
] as const;

export function looksLikeHtml(text: string) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

/** Converts legacy markdown-style assistant replies for older saved messages. */
export function legacyMarkdownToHtml(text: string) {
  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (!listType || listItems.length === 0) {
      return;
    }

    const items = listItems.map((item) => `<li>${item}</li>`).join("");
    htmlParts.push(`<${listType}>${items}</${listType}>`);
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flushList();
      htmlParts.push(`<h3>${inlineMarkdownToHtml(headingMatch[1])}</h3>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(inlineMarkdownToHtml(bulletMatch[1]));
      continue;
    }

    flushList();
    htmlParts.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  flushList();
  return htmlParts.join("");
}

function inlineMarkdownToHtml(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function normalizeAssistantHtml(text: string) {
  if (looksLikeHtml(text)) {
    return text;
  }

  return legacyMarkdownToHtml(text);
}

export const assistantHtmlSanitizeOptions = {
  ALLOWED_TAGS: [...ALLOWED_HTML_TAGS],
  ALLOWED_ATTR: ["class"],
};
