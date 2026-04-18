# AI Travel Planner

A full-stack AI-powered travel planning app that generates structured, editable itineraries — built as a real product, not a demo.

👉 **[Live Demo](https://ai-travel-planner-woad.vercel.app/)**

---

## Why I Built This

Most AI travel tools generate static text you can't actually work with.

I wanted to build something closer to a real product: structured output, editable plans, persistence, iterative refinement, and user control over AI decisions.

> AI generates ideas, but the application enforces correctness.

---

## Features

**AI Itinerary Generation**
Generates day-by-day plans (morning / afternoon / evening) based on destination, budget tier, travel style, and interests.

**Adaptive Replanning**
Regenerate a single day and optionally rebalance the rest of the itinerary — maintaining context across days instead of starting over. Turns the AI from a one-shot generator into a stateful planning system.

**Editable Itinerary**
Modify titles, activities, and tips. Add or remove activities per slot. Full control after generation.

**Persistent Trips**
Save, load, update, and delete trips. All data is user-scoped via Supabase authentication.

**Deterministic Budget System**
Budget ranges are calculated in code before the AI call — not invented by the model. Enforces realistic daily totals with a category breakdown (accommodation, dining, transport, experiences, buffer).

**Notes & Checklist**
Freeform notes and a checklist system per trip.

---

## Tech Stack

| Layer           | Tech                                                  |
| --------------- | ----------------------------------------------------- |
| Frontend        | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend         | Next.js API Routes                                    |
| AI              | Groq API (llama-3.3-70b)                              |
| Database & Auth | Supabase (PostgreSQL + Auth)                          |
| Deployment      | Vercel                                                |

---

## Engineering Approach

Built with an agentic workflow mindset — using AI tools (Claude Code, Cursor) for scaffolding and iteration, while focusing on:

- Breaking problems into smaller, testable systems
- Validating and constraining AI output (budget logic, JSON structure)
- Owning the product decisions, not just the prompts

---

## Local Setup

```bash
git clone https://github.com/trinayanswarup/Ai-Travel-Planner
cd Ai-Travel-Planner
npm install
```

Create a `.env.local` file using `.env.example` as reference:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Supabase setup:** Run `supabase/schema.sql` in your Supabase SQL editor for a fresh setup.

---

## Project Structure

```
app/
  api/generate/    # Groq API route
  page.tsx         # Main planner UI
components/        # Auth panel, reusable UI
lib/
  supabase/        # Auth + trip CRUD
  types/           # Shared TypeScript types
supabase/          # Schema + migration SQL
```
