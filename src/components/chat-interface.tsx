"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import type { UIMessage } from "ai";
import { ChatMessageContent } from "@/components/chat-message-content";
import { ReceiptImageButton } from "@/components/receipt-image-button";
import { guessImageContentType } from "@/lib/receipt-image-url";

type ChatInterfaceProps = {
  initialMessages: UIMessage[];
};

const DEFAULT_RECEIPT_PROMPT =
  "Please analyze this payment receipt and summarize the key details.";

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

function shouldDeferRefocus(relatedTarget: EventTarget | null) {
  if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) {
    return false;
  }

  const tag = relatedTarget.tagName;
  return (
    tag === "BUTTON" ||
    tag === "A" ||
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    relatedTarget.isContentEditable
  );
}

export function ChatInterface({ initialMessages }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<
    string | null
  >(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const isSending = status === "submitted" || status === "streaming";
  const hasAttachment = Boolean(attachedFile);
  const canSend = Boolean(input.trim() || hasAttachment);

  function focusInput() {
    inputRef.current?.focus();
  }

  function isNearBottom(container: HTMLElement) {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_BOTTOM_THRESHOLD_PX
    );
  }

  function updateScrollToBottomVisibility() {
    const container = messagesContainerRef.current;

    if (!container || messages.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    setShowScrollToBottom(
      container.scrollHeight > container.clientHeight && !isNearBottom(container),
    );
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }

  function clearAttachment() {
    setAttachedFile(null);
    setAttachmentPreviewUrl(null);
    setUploadError(null);
  }

  async function uploadReceiptImage(file: File): Promise<FileUIPart> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/receipt-image/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorMessage = (await response.text()).trim();
      throw new Error(errorMessage || "Could not upload receipt image.");
    }

    const payload = (await response.json()) as { url?: string };

    if (!payload.url) {
      throw new Error("Receipt image upload did not return a URL.");
    }

    return {
      type: "file",
      mediaType: file.type || guessImageContentType(file.name),
      filename: file.name,
      url: payload.url,
    };
  }

  async function sendCurrentMessage() {
    if (!canSend || isSending) {
      return;
    }

    setUploadError(null);
    const text = input.trim() || (hasAttachment ? DEFAULT_RECEIPT_PROMPT : "");
    let files: FileUIPart[] | undefined;

    if (attachedFile) {
      try {
        files = [await uploadReceiptImage(attachedFile)];
      } catch (error) {
        console.error("Receipt upload failed:", error);
        setUploadError(
          error instanceof Error
            ? error.message
            : "Unable to upload the receipt image right now. Please try again.",
        );
        return;
      }
    }

    sendMessage({
      text,
      files,
    });

    setInput("");
    clearAttachment();
    requestAnimationFrame(() => focusInput());
  }

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    if (!isSending) {
      focusInput();
    }
  }, [isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    if (isNearBottom(container) || messages.length <= 1) {
      scrollToBottom(isSending ? "auto" : "smooth");
    }

    updateScrollToBottomVisibility();
  }, [messages, isSending]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => updateScrollToBottomVisibility();
    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateScrollToBottomVisibility();
    });
    resizeObserver.observe(container);

    updateScrollToBottomVisibility();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [messages.length]);

  useEffect(() => {
    if (!attachedFile) {
      setAttachmentPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(attachedFile);
    setAttachmentPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [attachedFile]);

  function handleInputBlur(event: React.FocusEvent<HTMLTextAreaElement>) {
    const next = event.relatedTarget;
    const form = event.currentTarget.form;

    if (next && form?.contains(next as Node)) {
      return;
    }

    if (shouldDeferRefocus(next)) {
      return;
    }

    requestAnimationFrame(() => focusInput());
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesContainerRef}
          className="h-full space-y-4 overflow-y-auto p-6"
        >
        {uploadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {uploadError}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error.message ||
              "Could not get a reply. Please check your configuration and try again."}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Ask about your finances, or attach a payment receipt image to scan
            and ask questions about it.
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              <ChatMessageContent message={message} />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
        </div>

        {showScrollToBottom ? (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom"
            className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-lg transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}
      </div>

      <form
        className="shrink-0 border-t border-zinc-200 p-4 dark:border-zinc-800"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCurrentMessage();
        }}
      >
        {attachmentPreviewUrl ? (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <img
              src={attachmentPreviewUrl}
              alt="Receipt preview"
              className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Payment receipt attached
              </p>
              <p className="text-zinc-500 dark:text-zinc-400">
                {attachedFile?.name ?? "Image ready to send"}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              disabled={isSending}
              className="rounded-lg px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Remove
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <ReceiptImageButton
            disabled={isSending}
            onSelect={setAttachedFile}
          />
          <textarea
            ref={inputRef}
            autoFocus
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendCurrentMessage();
              }
            }}
            placeholder="Ask about your finances or a receipt..."
            className="h-12 flex-1 resize-none overflow-hidden rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !canSend}
            className="h-12 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
