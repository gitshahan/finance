"use client";

import type { ChatThread } from "@/lib/chat-store";
import { DEFAULT_CHAT_ID } from "@/lib/chat-store";

type ChatThreadSwitcherProps = {
  chats: ChatThread[];
  activeChatId: string;
  disabled?: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
  onDelete: (chatId: string) => void;
};

export function ChatThreadSwitcher({
  chats,
  activeChatId,
  disabled = false,
  onSelect,
  onCreate,
  onDelete,
}: ChatThreadSwitcherProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="chat-thread-select">
        Conversation
      </label>
      <select
        id="chat-thread-select"
        value={activeChatId}
        disabled={disabled || chats.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        className="max-w-[14rem] truncate rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {chats.map((chat) => (
          <option key={chat.chatId} value={chat.chatId}>
            {chat.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={onCreate}
        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        New chat
      </button>
      {activeChatId !== DEFAULT_CHAT_ID ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDelete(activeChatId)}
          className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-red-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-red-300"
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}
