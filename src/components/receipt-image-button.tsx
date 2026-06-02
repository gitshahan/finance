"use client";

import { useRef } from "react";

type ReceiptImageButtonProps = {
  disabled?: boolean;
  uploading?: boolean;
  /** 0–100 when known; omit for indeterminate progress */
  progress?: number;
  onSelect: (file: File) => void;
};

export function ReceiptImageButton({
  disabled = false,
  uploading = false,
  progress,
  onSelect,
}: ReceiptImageButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || uploading;
  const progressLabel =
    uploading && progress !== undefined
      ? `Uploading receipt image, ${progress} percent`
      : uploading
        ? "Uploading receipt image"
        : undefined;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={isDisabled}
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
        disabled={isDisabled}
        aria-label={
          uploading ? "Uploading payment receipt image" : "Attach payment receipt image"
        }
        aria-busy={uploading}
        title={
          uploading ? "Uploading payment receipt image…" : "Attach payment receipt image"
        }
        className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {uploading ? (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-zinc-200 dark:bg-zinc-700"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={progressLabel}
          >
            <span
              className={`block h-full bg-blue-500 transition-[width] duration-150 ease-out dark:bg-blue-400 ${
                progress === undefined ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                progress !== undefined ? { width: `${progress}%` } : undefined
              }
            />
          </span>
        ) : null}

        {uploading ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-xl border-2 border-blue-500/40 dark:border-blue-400/40"
            aria-hidden="true"
          />
        ) : null}

        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 transition-opacity ${uploading ? "opacity-40" : ""}`}
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
