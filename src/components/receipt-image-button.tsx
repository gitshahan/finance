"use client";

import { useRef } from "react";

type ReceiptImageButtonProps = {
  disabled?: boolean;
  onSelect: (file: File) => void;
};

export function ReceiptImageButton({
  disabled = false,
  onSelect,
}: ReceiptImageButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const selectedFiles = event.target.files;

          if (selectedFiles && selectedFiles.length > 0) {
            onSelect(selectedFiles[0]);
          }

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach payment receipt image"
        title="Attach payment receipt image"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
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
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </button>
    </>
  );
}
