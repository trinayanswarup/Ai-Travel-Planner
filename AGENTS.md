# Project Context for AI Agents

This is a Next.js 15+ project using the App Router.

## Stack
- Framework: Next.js (App Router, not Pages Router)
- Language: TypeScript — use strict types, avoid `any`
- Styling: Tailwind CSS only — no inline styles, no CSS modules
- AI: Groq API (Llama 3.3 70B) via `/api/generate` route
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Deployment: Vercel

## Project Purpose
AI-powered travel itinerary planner. Users input a destination and preferences, Groq AI generates a personalised day-by-day travel plan. Trip data is persisted in Supabase.

## Key Conventions
- All AI calls go through `/app/api/` route handlers — never call Groq from the frontend
- Keep AI prompts server-side only
- Supabase schema is in `/supabase/schema.sql` — run this for a fresh setup
- Auth ownership migration: `/supabase/auth_migration.sql`
- Components live in `/components/` and `/app/`

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — public, safe to expose
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, safe to expose
- `GROQ_API_KEY` — server-only, never expose as `NEXT_PUBLIC_*`

## What NOT to do
- Do not use the Pages Router (`/pages/` directory)
- Do not use `getServerSideProps` or `getStaticProps`
- Do not expose the Groq API key to the client
- Do not use inline styles — Tailwind only
- Do not modify Supabase schema directly — update `schema.sql` first
