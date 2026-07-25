"use client";

import { UserQuotaIndicator } from "@/components/user-quota-indicator";
import type { ChatThread } from "@/lib/chat-store";
import { DEFAULT_CHAT_ID } from "@/lib/chat-store";
import type { UserTokenUsage } from "@/lib/token-usage-store";

type ChatSidebarProps = {
  chats: ChatThread[];
  activeChatId: string;
  open: boolean;
  tokenUsage?: UserTokenUsage | null;
  /** Hide "+ New" until the active thread has messages. */
  canCreate?: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
  onDelete: (chatId: string) => void;
};

function chatLabel(chat: ChatThread) {
  if (chat.chatId === DEFAULT_CHAT_ID && chat.title === "New chat") {
    return "Main chat";
  }

  return chat.title;
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ChatSidebar({
  chats,
  activeChatId,
  open,
  tokenUsage = null,
  canCreate = false,
  disabled = false,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: ChatSidebarProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close chat list"
        className={`fixed inset-0 z-40 bg-zinc-950/40 transition-opacity md:hidden ${
          open
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        id="chat-sidebar"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-hidden border-r border-border bg-surface shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:shadow-none md:rounded-2xl md:border ${
          open
            ? "translate-x-0 md:w-64 md:shrink-0"
            : "-translate-x-full md:pointer-events-none md:w-0 md:translate-x-0 md:border-0 md:opacity-0"
        }`}
      >
        <div className="border-b border-border bg-brand-soft/50 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <img
                src="/vite.svg"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm"
              />
              <p className="font-display min-w-0 truncate text-[0.95rem] font-semibold tracking-display text-foreground">
                Autonicals Finance
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canCreate ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onCreate}
                  aria-label="New chat"
                  title="New chat"
                  className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-brand transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-muted"
                >
                  + New
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Collapse chat list"
                title="Collapse"
                className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition hover:bg-white/70 hover:text-brand dark:hover:bg-brand-muted dark:hover:text-brand-strong"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>

        <nav
          aria-label="Past chats"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {chats.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              No chats yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const isActive = chat.chatId === activeChatId;
                const canDelete = chat.chatId !== DEFAULT_CHAT_ID;
                const label = chatLabel(chat);

                return (
                  <li key={chat.chatId} className="group relative">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(chat.chatId)}
                      aria-current={isActive ? "page" : undefined}
                      title={label}
                      className={`flex w-full cursor-pointer items-center rounded-lg py-2 pr-8 pl-2.5 text-left text-[0.8125rem] font-medium tracking-tight transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isActive
                          ? "bg-brand text-white"
                          : "text-foreground/80 hover:bg-brand-soft hover:text-foreground dark:hover:bg-brand-muted"
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>

                    {canDelete ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(chat.chatId);
                        }}
                        aria-label={`Delete ${label}`}
                        title="Delete chat"
                        className={`absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isActive
                            ? "text-white/80 hover:bg-white/15 hover:text-white"
                            : "text-zinc-400 hover:bg-brand-muted hover:text-red-600 dark:hover:text-red-400"
                        }`}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {tokenUsage ? (
          <div className="shrink-0 border-t border-border px-3 py-3">
            <UserQuotaIndicator usage={tokenUsage} />
          </div>
        ) : null}
      </aside>
    </>
  );
}
