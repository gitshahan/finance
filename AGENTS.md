<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Finance Chat is a single Next.js 16 (App Router, Turbopack) app — there is one service. Package manager is **pnpm** (Node 22). Standard scripts live in `package.json`: `pnpm dev` (port 3000), `pnpm build`, `pnpm start`, `pnpm lint`. Env var requirements are documented in `README.md`.

Non-obvious caveats:

- **Auth works with no Clerk keys via keyless mode.** If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` are unset, `@clerk/nextjs` auto-creates a temporary dev Clerk app on first `pnpm dev` and writes credentials to `.clerk/.tmp/keyless.json` (gitignored). No env setup is needed just to reach sign-in.
- **Browser sign-UP is blocked in automated/headless Chrome.** The keyless Clerk instance enforces a Cloudflare Turnstile CAPTCHA on sign-up that fails to load ("CAPTCHA failed to load"). To get a usable account, create a verified user via the Clerk Backend API using the keyless secret key, then sign IN (sign-in has no Turnstile):
  `SK=$(node -e "console.log(require('./.clerk/.tmp/keyless.json').secretKey)"); curl -s -X POST https://api.clerk.com/v1/users -H "Authorization: Bearer $SK" -H "Content-Type: application/json" -d '{"email_address":["you+clerk_test@example.com"],"password":"DemoPassw0rd!2026","skip_password_checks":true}'`
- **Use a `+clerk_test` email.** Sign-in triggers Clerk device-trust email verification; for `+clerk_test` addresses the verification code is always `424242` (no real email is sent). Non-test emails get stuck because the code is emailed.
- **Chat needs an external key.** With auth alone the dashboard loads, but sending a message returns 500 `AI Gateway is not configured (missing AI_GATEWAY_API_KEY)`. Set `AI_GATEWAY_API_KEY` (Vercel AI Gateway) in `.env.local` to exercise the assistant. `DATABASE_URL` (Neon) is optional — without it the dashboard shows a "chat history is not being saved" banner and chat is session-only. `BLOB_READ_WRITE_TOKEN` (Vercel Blob) is only needed for receipt image/CSV uploads.
