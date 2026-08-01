"use client";

import { useState, type FormEvent } from "react";
import {
  MIN_USER_ENCRYPTION_KEY_LENGTH,
  type UserLlmCredentialStatus,
} from "@/lib/llm-credentials-store";

type LlmApiKeySetupProps = {
  initialStatus: UserLlmCredentialStatus;
  storageReady: boolean;
  onConfigured: (status: UserLlmCredentialStatus) => void;
  /** Compact settings panel vs full-screen first-run / unlock gate. */
  mode?: "gate" | "settings";
  onClose?: () => void;
  /** Returning users with chat/usage history but no saved API key. */
  hasExistingAccountData?: boolean;
};

export function LlmApiKeySetup({
  initialStatus,
  storageReady,
  onConfigured,
  mode = "gate",
  onClose,
  hasExistingAccountData = false,
}: LlmApiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [encryptionKey, setEncryptionKey] = useState("");
  const [confirmEncryptionKey, setConfirmEncryptionKey] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const needsUnlock = status.configured && !status.unlocked;
  const isSetup = !status.configured;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (encryptionKey !== confirmEncryptionKey) {
      setError("Encryption keys do not match.");
      return;
    }

    if (encryptionKey.trim().length < MIN_USER_ENCRYPTION_KEY_LENGTH) {
      setError(
        `Encryption key must be at least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters.`,
      );
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/llm-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, encryptionKey }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to save API key.");
      }

      const next = (await response.json()) as UserLlmCredentialStatus;
      setStatus(next);
      setApiKey("");
      setEncryptionKey("");
      setConfirmEncryptionKey("");
      onConfigured(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save API key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/llm-credentials/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptionKey }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to unlock.");
      }

      const next = (await response.json()) as UserLlmCredentialStatus;
      setStatus(next);
      setEncryptionKey("");
      onConfigured(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unlock.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsRemoving(true);

    try {
      const response = await fetch("/api/llm-credentials", {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to remove API key.");
      }

      const next = (await response.json()) as UserLlmCredentialStatus;
      setStatus(next);
      onConfigured(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to remove API key.",
      );
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleLock() {
    setError(null);
    setIsLocking(true);

    try {
      const response = await fetch("/api/llm-credentials/unlock", {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to lock session.");
      }

      const next = (await response.json()) as UserLlmCredentialStatus;
      setStatus(next);
      onConfigured(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to lock session.",
      );
    } finally {
      setIsLocking(false);
    }
  }

  const title = needsUnlock
    ? "Unlock your API key"
    : status.configured
      ? "API key & encryption"
      : hasExistingAccountData
        ? "Add your API key to continue"
        : "Add your OpenAI API key";

  const description = needsUnlock
    ? `Enter the encryption key for the saved OpenAI key ending in ···${status.keyLastFour}. It is never stored on the server.`
    : status.configured
      ? `Saved key ending in ···${status.keyLastFour}. Replacing requires a new encryption key; usage is billed to your OpenAI account.`
      : hasExistingAccountData
        ? "Your account already has saved chats, but chat is locked until you add an OpenAI API key and encryption key."
        : "Provide an OpenAI API key and your own encryption key. The encryption key locks the API key at rest and is never saved.";

  const panel = (
    <div
      className={
        mode === "gate"
          ? "w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(15,39,68,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          : "w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg"
      }
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-display text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {mode === "settings" && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        ) : null}
      </div>

      {!storageReady ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          API key storage needs a database. Set{" "}
          <code className="font-mono text-xs">DATABASE_URL</code> and restart
          the app.
        </p>
      ) : needsUnlock ? (
        <form
          onSubmit={(event) => void handleUnlock(event)}
          className="space-y-3"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Encryption key
            </span>
            <div className="flex gap-2">
              <input
                type={showSecrets ? "text" : "password"}
                name="encryptionKey"
                autoComplete="current-password"
                spellCheck={false}
                placeholder="Your encryption key"
                value={encryptionKey}
                onChange={(event) => setEncryptionKey(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-brand-ring placeholder:text-muted/70 focus:ring-2"
                required
                minLength={MIN_USER_ENCRYPTION_KEY_LENGTH}
              />
              <button
                type="button"
                onClick={() => setShowSecrets((value) => !value)}
                className="shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-foreground"
              >
                {showSecrets ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error ? (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving || !encryptionKey.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              disabled={isRemoving}
              onClick={() => void handleRemove()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              {isRemoving ? "Removing…" : "Remove saved key"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={(event) => void handleSave(event)} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              {status.configured ? "Replace OpenAI API key" : "OpenAI API key"}
            </span>
            <input
              type={showSecrets ? "text" : "password"}
              name="openaiApiKey"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-brand-ring placeholder:text-muted/70 focus:ring-2"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Encryption key
            </span>
            <input
              type={showSecrets ? "text" : "password"}
              name="encryptionKey"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={`At least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters`}
              value={encryptionKey}
              onChange={(event) => setEncryptionKey(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-brand-ring placeholder:text-muted/70 focus:ring-2"
              required
              minLength={MIN_USER_ENCRYPTION_KEY_LENGTH}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Confirm encryption key
            </span>
            <div className="flex gap-2">
              <input
                type={showSecrets ? "text" : "password"}
                name="confirmEncryptionKey"
                autoComplete="new-password"
                spellCheck={false}
                placeholder="Re-enter encryption key"
                value={confirmEncryptionKey}
                onChange={(event) => setConfirmEncryptionKey(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-brand-ring placeholder:text-muted/70 focus:ring-2"
                required
                minLength={MIN_USER_ENCRYPTION_KEY_LENGTH}
              />
              <button
                type="button"
                onClick={() => setShowSecrets((value) => !value)}
                className="shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-foreground"
              >
                {showSecrets ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error ? (
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={
                isSaving ||
                !apiKey.trim() ||
                !encryptionKey.trim() ||
                !confirmEncryptionKey.trim()
              }
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Saving…"
                : status.configured
                  ? "Update keys"
                  : "Save and continue"}
            </button>
            {status.configured && status.unlocked ? (
              <button
                type="button"
                disabled={isLocking}
                onClick={() => void handleLock()}
                title="Clear temporary access in this browser without deleting your saved key"
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
              >
                {isLocking ? "Locking…" : "Lock session"}
              </button>
            ) : null}
            {status.configured ? (
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => void handleRemove()}
                className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50"
              >
                {isRemoving ? "Removing…" : "Remove key"}
              </button>
            ) : null}
          </div>

          {status.configured && status.unlocked ? (
            <p className="text-xs text-muted">
              Lock session ends temporary access in this browser without
              deleting your saved key. You&apos;ll need your encryption key to
              unlock again. Sessions also expire after 12 hours.
            </p>
          ) : null}

          <p className="text-xs text-muted">
            {isSetup
              ? "Remember your encryption key — you will need it to unlock on new devices or after the session expires. Create an OpenAI key at "
              : "Create a key at "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              platform.openai.com/api-keys
            </a>
            .
          </p>
        </form>
      )}
    </div>
  );

  if (mode === "settings") {
    return panel;
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-4 py-10">
      {panel}
    </div>
  );
}
