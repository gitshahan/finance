"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type ReceiptImageButtonHandle = {
  open: () => void;
};

type ReceiptImageButtonProps = {
  disabled?: boolean;
  uploading?: boolean;
  /** Compact control for use inside the chat composer. */
  variant?: "default" | "inline";
  /** 0–100 when known; omit for indeterminate progress */
  progress?: number;
  onSelect: (file: File) => void;
};

export const ReceiptImageButton = forwardRef<
  ReceiptImageButtonHandle,
  ReceiptImageButtonProps
>(function ReceiptImageButton(
  {
    disabled = false,
    uploading = false,
    variant = "default",
    progress,
    onSelect,
  },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || uploading;
  const progressLabel =
    uploading && progress !== undefined
      ? `Uploading CSV file, ${progress} percent`
      : uploading
        ? "Uploading CSV file"
        : undefined;

  useImperativeHandle(ref, () => ({
    open: () => {
      if (!isDisabled) {
        fileInputRef.current?.click();
      }
    },
  }));

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,application/csv"
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
        aria-label={uploading ? "Uploading CSV" : "Attach CSV file"}
        aria-busy={uploading}
        title={uploading ? "Uploading CSV…" : "Attach CSV file (max 1MB)"}
        className={
          variant === "inline"
            ? `relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-zinc-600 transition dark:text-zinc-300 ${
                uploading
                  ? "cursor-wait bg-brand-soft text-brand"
                  : "cursor-pointer hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              }`
            : `relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-surface text-zinc-700 transition ${
                uploading
                  ? "cursor-wait border-brand-accent"
                  : "cursor-pointer border-border hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              }`
        }
      >
        {uploading && variant === "default" ? (
          <span
            className="pointer-events-none absolute inset-0 bg-brand-soft/80"
            aria-hidden="true"
          />
        ) : null}

        {uploading ? (
          <span
            className={`pointer-events-none absolute inset-x-0 bottom-0 bg-zinc-200 dark:bg-zinc-700 ${
              variant === "inline" ? "h-1" : "h-1.5"
            }`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={progressLabel}
          >
            <span
              className={`block h-full bg-brand-accent transition-[width] duration-150 ease-out ${
                progress === undefined ? "w-1/3 animate-pulse" : ""
              }`}
              style={
                progress !== undefined
                  ? { width: `${Math.max(progress, 4)}%` }
                  : undefined
              }
            />
          </span>
        ) : null}

        {uploading ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`relative animate-spin text-brand ${
              variant === "inline" ? "h-4 w-4" : "h-5 w-5"
            }`}
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={variant === "inline" ? "h-4 w-4" : "h-5 w-5"}
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8" />
            <path d="M8 17h5" />
          </svg>
        )}
      </button>
    </>
  );
});
