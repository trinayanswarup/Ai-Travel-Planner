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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

### Environment variables

Configure these in Vercel Project Settings -> Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
- `GROQ_API_KEY` (server-only, never expose as `NEXT_PUBLIC_*`)

Use `.env.example` as the source of truth for required keys.

### Supabase setup

Run SQL in your Supabase SQL editor:

1. Fresh setup: `supabase/schema.sql`
2. Existing projects upgrading to auth ownership: `supabase/auth_migration.sql`

### Build/runtime checks

- Build command: `npm run build`
- Start command: `npm run start`
- API route: `/api/generate` runs as a dynamic server route in production.

This app is compatible with default Vercel Next.js deployment settings.
