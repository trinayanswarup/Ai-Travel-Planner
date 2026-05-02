**AI-powered travel itinerary planner — generates personalised day-by-day trip plans, stores them in Supabase, and lets users iteratively refine them.**

## What It Does

Users enter a destination, date range, budget tier, travel style, and interests. Groq's Llama 3.3 70B model generates a structured day-by-day itinerary (morning / afternoon / evening activities). Plans are editable after generation — users can modify activities, regenerate individual days, and rebalance the rest of the trip to maintain context. Trips are saved per-user in Supabase and persist across sessions.

Live: https://ai-travel-planner-woad.vercel.app

## Tech Stack

| Layer      | Technology                   |
|------------|------------------------------|
| Language   | TypeScript                   |
| Framework  | Next.js 15 App Router        |
| AI         | Groq API — Llama 3.3 70B     |
| Database   | Supabase PostgreSQL          |
| Auth       | Supabase Auth                |
| Styling    | Tailwind CSS                 |
| Deployment | Vercel                       |

## Architecture Decisions

- **AI calls are server-side only.** All Groq requests go through `/api/generate`. The API key never touches the browser, and the server controls prompt construction, budget constraints, and output validation before anything reaches the client.
- **Groq over OpenAI.** Groq's inference speed on Llama 3.3 70B is significantly faster for JSON-structured outputs, which matters for a planning flow where the user is waiting on a response.
- **Supabase for both auth and database.** One provider means user IDs from the auth layer map directly to Row-Level Security policies on the trips table — no separate user management, no cross-service JWT translation.

## AI Development Workflow

This project was built using Claude Code as the primary development agent. Before writing any code, `AGENTS.md` was written first to give the agent explicit context about the stack, conventions, and breaking changes in this version of Next.js. `CLAUDE.md` points to `AGENTS.md` so the agent loads project context automatically on every startup.

Specific redirections made during development:
- The agent initially called the Groq API directly from the page component (client-side). Caught and redirected to a server-side API route to keep the key off the client.
- The agent used `getServerSideProps` in early scaffolding — a Pages Router pattern. Corrected to App Router conventions (route handlers, server components).
- Budget logic was being delegated entirely to the AI prompt. Redirected to deterministic code-side calculation before the API call, with the model instructed to stay within the pre-computed ranges.

## Getting Started

```bash
git clone https://github.com/trinayanswarup/Ai-Travel-Planner
cd Ai-Travel-Planner
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

On first setup, run `supabase/schema.sql` in your Supabase SQL editor to create the trips table and RLS policies.

## Environment Variables

| Variable                        | Scope            | Description                                          |
|---------------------------------|------------------|------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Public (browser) | Supabase project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (browser) | Supabase anon key                                    |
| `GROQ_API_KEY`                  | Server-only      | Groq API key — never exposed to the client           |
