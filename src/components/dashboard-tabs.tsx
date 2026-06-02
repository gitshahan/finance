"use client";

import { useState } from "react";

type DashboardTab = "chat" | "receipts";

type DashboardTabsProps = {
  chat: React.ReactNode;
  receipts: React.ReactNode;
};

export function DashboardTabs({ chat, receipts }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("chat");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex shrink-0 gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            activeTab === "chat"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "receipts"}
          onClick={() => setActiveTab("receipts")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            activeTab === "receipts"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Receipts & export
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "chat" ? chat : receipts}
      </div>
    </div>
  );
}
