# Project Context for AI Agents

## What This App Does
AI-powered travel itinerary planner. User inputs a destination, budget tier, travel style, and interests. Groq AI generates a structured day-by-day plan (morning/afternoon/evening). Users can edit plans, regenerate individual days, and save trips persistently. Budget ranges are calculated in application code before the AI call — the model never invents numbers.

## Stack
- Framework: Next.js 15 (App Router only — never Pages Router)
- Language: TypeScript — strict types, never use `any`
- Styling: Tailwind CSS only — no inline styles, no CSS modules
- AI: Groq API (llama-3.3-70b) via /app/api/generate route
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (user-scoped trips)
- Deployment: Vercel

## Architecture Rules
- All Groq API calls go through server-side /app/api/ route handlers — never call from the client
- Budget logic runs in application code before the AI prompt is constructed — do not let the model calculate budgets
- Keep AI prompts server-side only
- Supabase schema lives in /supabase/schema.sql — update this file before touching the database
- Components live in /components/ and /app/

## Environment Variables
- NEXT_PUBLIC_SUPABASE_URL — public, safe to expose
- NEXT_PUBLIC_SUPABASE_ANON_KEY — public, safe to expose  
- GROQ_API_KEY — server-only, never expose as NEXT_PUBLIC_*

## What NOT To Do
- Do not use Pages Router (/pages/ directory)
- Do not use getServerSideProps or getStaticProps
- Do not expose GROQ_API_KEY to the client under any circumstance
- Do not use inline styles
- Do not let the AI model generate budget numbers — always calculate in code first
- Do not modify Supabase schema directly — update schema.sql first
