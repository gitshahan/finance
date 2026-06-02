This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Required Environment Variables

This app uses Clerk auth, the Vercel AI SDK (via Vercel AI Gateway), and Neon for persisted chat.

Add these keys to `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
AI_GATEWAY_API_KEY=agw_...
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Then run `pnpm dev`, sign in at `http://localhost:3000/sign-in`, and you will be redirected to `http://localhost:3000/dashboard`.

Optional Clerk redirect env vars (match `src/lib/auth-redirect.ts` if you change the dashboard path):

```bash
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/dashboard
```

In the Clerk Dashboard, set **Home URL** and post-auth redirects to `/dashboard`. Google and other OAuth providers use a same-window redirect via `/sso-callback`, then land on `/dashboard`.

`DATABASE_URL` is required for saved chat history. Without it, the dashboard still loads and chat works for the current session.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
