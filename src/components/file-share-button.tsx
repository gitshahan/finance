"use client";

import { useRef, useState } from "react";

export function FileShareButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  async function handleFileSelection(file: File | null) {
    if (!file) {
      return;
    }

    setIsSharing(true);

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: `Shared from Finance Chat`,
          text: "Sharing a file from the dashboard.",
        });
        return;
      }

      await navigator.clipboard.writeText(file.name);
      alert(`Sharing is not supported here. Copied file name: ${file.name}`);
    } catch {
      alert("Unable to share this file right now.");
    } finally {
      setIsSharing(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const [selectedFile] = event.target.files ?? [];
          void handleFileSelection(selectedFile ?? null);
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSharing}
        aria-label="Share a file"
        title="Share a file"
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {isSharing ? (
          "..."
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l9.2-9.2a4 4 0 115.66 5.66l-9.2 9.2a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        )}
      </button>
    </>
  );
}
