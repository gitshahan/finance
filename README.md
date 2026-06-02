# Finance Chat — Receipt Assistant

A Next.js app where signed-in users chat with an AI assistant scoped to **payment receipts and data they have shared** (images, CSV attachments, and indexed receipt records). Built for a time-boxed technical assessment; the sections below document approach, trade-offs, and scoping—not only how to run the app.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated visitors are sent to sign-in; after auth you land on `/dashboard`.

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
| `DATABASE_URL` | Persisted chat, receipt index, token quotas | Session-only chat; banner on dashboard |
| `BLOB_READ_WRITE_TOKEN` | Uploading receipt images/CSV | Upload fails |

---

## Documentation (assessment write-up)

### Features / tasks covered

| Area | Status | Notes |
|------|--------|--------|
| **Authentication** | Done | Clerk sign-in/sign-up, `proxy.ts` route protection, `/sso-callback` for OAuth same-window redirect |
| **Receipt-focused chat** | Done | Streaming chat via Vercel AI SDK; system prompt limits scope to shared receipt data |
| **Image uploads** | Done | JPEG/PNG/WebP/etc. → private Vercel Blob under per-user paths; 5MB limit; upload on attach with progress |
| **CSV attachments** | Done | 1MB limit; parsed in-chat; assistant summarizes and answers from file content |
| **Secure file access** | Done | Blob URLs validated per user; `/api/receipt-image` proxy for model/history; 403 if messages reference another user’s blobs |
| **Chat persistence** | Done | `chat_messages` in Neon; full thread replaced after each completed turn |
| **Receipt indexing** | Done (images) | On sync, vision + `generateObject` extracts merchant, date, amount, etc. into `user_shared_receipts`; injected into system prompt (up to 100 rows) |
| **Cross-session memory** | Done | Follow-ups can use receipts shared in earlier sessions when `DATABASE_URL` is set |
| **CSV export (in chat)** | Done | `generateCsvDownload` tool: server-side filter of attached CSVs (≤200 rows) or tiny inline exports (≤30 rows); download button in UI |
| **CSV export (saved receipts API)** | Backend only | `GET /api/receipts` and `GET /api/receipts/export` with filters and 200-row cap; **no dashboard UI** (tab removed to prioritize chat) |
| **Token / usage quota** | Done | Per-user totals in Neon; dashboard progress bar; 429 when total/output token caps hit |
| **Assistant HTML rendering** | Done | Model instructed to reply in HTML; sanitized with DOMPurify |
| **Resilience** | Done | Dashboard loads if DB missing; persistence disabled with user-visible notice |

### Architectural and technical decisions

- **Next.js 16 App Router** — Server Components for dashboard bootstrap (load history + quota); client chat via `@ai-sdk/react` and `DefaultChatTransport` to `/api/chat`.
- **Clerk** — Fast, assessment-friendly auth; `clerkMiddleware` in `src/proxy.ts` protects `/dashboard` and receipt/chat APIs.
- **Vercel AI Gateway + AI SDK** — Single `CHAT_MODEL` env default (`openai/gpt-5.4-nano`) with vision for receipt images; `streamText` + tools for CSV downloads.
- **Neon (serverless Postgres)** — One database for chat JSON, receipt index, and token usage; tables created on demand with `CREATE TABLE IF NOT EXISTS` to avoid a separate migration step in the assessment window.
- **Vercel Blob (private)** — Files are not public; the app never sends raw blob URLs to the model for persisted history—blobs are re-fetched server-side and inlined as data URLs or text when needed (`prepareMessagesForModel`).
- **Receipt index separate from chat** — Structured rows power historical Q&A without re-sending every image each turn; extraction runs once per new image URL.
- **Tool-based CSV export** — The model must call `generateCsvDownload` instead of fabricating large tables in HTML; attachment exports filter on the server (`filterFromAttachments`) so row data is not passed through the tool argument payload.
- **Scoped assistant** — `receipt-assistant-prompt.ts` refuses general finance advice and grounds answers in shared data only.

### Assumptions, trade-offs, and limitations

- **Single chat thread per user** — `chat_id` is fixed to `"default"`; no multi-conversation UI.
- **CSV files are not indexed** — Only receipt **images** are written to `user_shared_receipts`; CSV data lives in the message thread and attachment export path.
- **Extraction quality** — Depends on model vision/OCR; blurry or cropped receipts may yield null fields; the prompt tells the model not to guess.
- **Export caps** — At most **200** rows per export (chat tool or API); chat tool may truncate and should inform the user.
- **API export without UI** — Filtered export of saved receipts requires calling `/api/receipts/export` manually (or re-adding a tab); product flow is export **via chat** (e.g. “export my Netflix rows from the CSV I uploaded”).
- **Quota model** — Limits (1M total tokens, 286k output tokens, 550 requests tracked) are approximate product guardrails; request count is displayed but **only token totals block** new chat requests today.
- **No automated tests** — Manual verification only within the time box.
- **English-first** — Receipt text and UI copy assume English; no i18n.

### Intentional omissions

- **“Receipts & export” dashboard tab** — Removed in favor of a chat-only dashboard; list/export APIs remain for possible reuse or API clients.
- **Admin / support tools** — No quota override UI; “contact support” copy only.
- **Receipt deletion UI** — Orphan blob cleanup runs when messages are rewritten; no user-facing delete.
- **Real-time multi-device sync** — History loads on page load; no live sync across tabs.
- **Billing, teams, or orgs** — Single-user Clerk accounts only.
- **Comprehensive CSV schema validation** — Lightweight parser; malformed files are handled best-effort in prompts.

### Challenges faced

1. **OAuth redirect loop / blank dashboard** — Clerk redirect URLs and a dedicated `/sso-callback` route were aligned with `AUTH_COMPLETE_URL` so Google sign-in lands on a loaded dashboard.
2. **Persisted chat without breaking local dev** — Missing or invalid `DATABASE_URL` previously broke the dashboard; load paths now catch errors and fall back to session-only chat with a clear banner.
3. **Private blobs in persisted messages** — Stored messages keep blob URLs; the server re-reads owned blobs per request and checks `messagesOnlyUseOwnedReceiptBlobs` to prevent cross-user URL injection.
4. **CSV export reliability** — Early exports tried to pass hundreds of rows through the tool call; moving filtering to the server (`chat-csv-filter-export.ts`) fixed timeouts and hallucinated rows.
5. **Scope vs. time** — A full receipts browser was dropped so effort stayed on core chat, indexing, and in-conversation export—the main assessment narrative.

---

## Project layout (high level)

```
src/app/api/chat/          # Streaming assistant + persistence
src/app/api/receipt-image/ # Upload + authenticated blob proxy
src/app/api/receipts/      # List/filter saved receipts (JSON)
src/app/api/receipts/export/  # Filtered CSV download (API)
src/components/            # Chat UI, quota bar, message rendering
src/lib/                   # DB, blobs, extraction, tools, prompts
src/proxy.ts               # Clerk middleware (protected routes)
```

## Deploy

Deploy on [Vercel](https://vercel.com/new) with the same environment variables. Link Neon and Blob storage; ensure Clerk production URLs match your deployment domain.
