# Finance Chat

A Next.js app where signed-in users chat with an AI assistant scoped to **payment receipts and data they have shared** (images, CSV attachments, and indexed receipt records). Chat-first product surface: searchable receipt memory, spend summaries, corrections, multi-conversation threads, and CSV export via tools.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated visitors are sent to sign-in; after auth you land on `/dashboard`.

```bash
pnpm test   # unit tests
pnpm build  # production build
```

### Environment variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
AI_GATEWAY_API_KEY=agw_...
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Optional:

```bash
AI_CHAT_MODEL=openai/gpt-5.4-nano   # default; must support vision for receipt images
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/dashboard
```

In the Clerk Dashboard, set **Home URL** and post-auth redirects to `/dashboard`. Google and other OAuth providers use `/sso-callback`, then `/dashboard`.

| Variable | Required for | Without it |
|----------|----------------|------------|
| Clerk keys | Sign-in, protected routes | App cannot authenticate |
| `AI_GATEWAY_API_KEY` | Chat replies | Chat API returns 500 |
| `DATABASE_URL` | Persisted chat, receipt index, token quotas | Chat API returns 503 (quotas fail closed); banner on dashboard |
| `BLOB_READ_WRITE_TOKEN` | Uploading receipt images/CSV | Upload fails |

---

## Features

| Area | Status | Notes |
|------|--------|--------|
| **Authentication** | Done | Clerk sign-in/sign-up, `proxy.ts` route protection, `/sso-callback` for OAuth |
| **Receipt-focused chat** | Done | Streaming chat via Vercel AI SDK; tools for search, spend, export, corrections |
| **Multi-conversation** | Done | `chat_threads` + `chat_id`; switcher on dashboard; receipt index is account-wide |
| **Image uploads** | Done | Private Vercel Blob under per-user paths; 5MB limit; upload on attach with progress |
| **CSV attachments** | Done | 1MB limit; parsed in-chat; rows indexed into shared memory with dedupe |
| **Secure file access** | Done | Blob URLs validated per user; `/api/receipt-image` proxy; 403 on foreign blobs |
| **Chat persistence** | Done | `chat_messages` in Neon; full thread replaced after each completed turn |
| **Receipt indexing** | Done | Images via vision + `generateObject`; CSV rows via column mapping; categories |
| **Queryable memory** | Done | `searchSavedReceipts` / `summarizeSpend` tools; short index summary in system prompt |
| **Corrections** | Done | `confirmSavedReceipt`, `updateSavedReceipt`, `deleteSavedReceipt`, `setMerchantCategory` |
| **CSV export** | Done | From attachments, saved index (`filterFromSavedReceipts`), or tiny inline tables |
| **Spend insights UI** | Done | `summarizeSpend` renders a table (default) or bar chart when `display: chart` |
| **Token / usage quota** | Done | Per-user totals in Neon; dashboard progress bar; 429 when caps hit |
| **Assistant HTML rendering** | Done | Model replies in HTML; sanitized with DOMPurify |

### Architectural notes

- **Next.js 16 App Router** — Server Components bootstrap dashboard (history + quota + threads); client chat via `@ai-sdk/react`.
- **Receipt index separate from chat** — Structured rows power historical Q&A; tools query Neon instead of stuffing dozens of rows into the prompt.
- **Account-wide memory** — Deleting a chat thread does not wipe indexed receipts; explicit `deleteSavedReceipt` does.
- **Scoped assistant** — Refuses general finance advice; grounds answers in shared data and tool results only.

### Limits

- Export caps at **200** rows; search tool returns up to **50**.
- Vision extraction capped at **2** new images per chat request.
- CSV indexing: up to **2** files / **200** rows per request; dedupes against existing merchant+date+amount.
- Quota model: 1M total tokens / 286k output / 550 requests; chat requires `DATABASE_URL`.

### Intentional omissions

- Full receipts browser dashboard tab (APIs remain; product path is chat tools)
- Billing, teams / orgs, admin quota overrides
- Real-time multi-tab sync (history loads on navigation)

---

## Project layout (high level)

```
src/app/api/chat/          # Streaming assistant + persistence
src/app/api/chats/         # List/create/rename/delete conversations
src/app/api/receipt-image/ # Upload + authenticated blob proxy
src/app/api/receipts/      # List/filter saved receipts (JSON + CSV export)
src/components/            # Chat UI, thread switcher, spend summary, quota bar
src/lib/                   # DB, blobs, extraction, CSV index, tools, prompts
src/proxy.ts               # Clerk middleware (protected routes)
```

## Deploy

Deploy on [Vercel](https://vercel.com/new) with the same environment variables. Link Neon and Blob storage; ensure Clerk production URLs match your deployment domain.
