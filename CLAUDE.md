# Claude Code Instructions

@AGENTS.md

## How This Project Was Built

This project was built using Claude Code as the primary development agent. AGENTS.md was written first — before any code — to give the agent consistent context about the stack, conventions, and constraints.

## Key Decisions Made During Development

**Budget system:** The AI initially generated budget numbers inside the prompt response, which produced inconsistent and sometimes unrealistic totals. I redirected this: budget ranges are now calculated deterministically in application code before the AI call, and the prompt only receives pre-calculated values. The model never invents numbers.

**API route structure:** The agent initially attempted to call the Groq API directly from a client component. I caught this and redirected all AI calls through a server-side /app/api/generate route handler. The API key never touches the client.

**App Router conventions:** Early scaffolding included getServerSideProps patterns from the Pages Router. I corrected this to use App Router conventions throughout — server components, route handlers, and layout.tsx.

## What I Validated Manually
- Budget totals produce realistic daily breakdowns across all budget tiers
- Groq API key is never exposed in client-side bundles
- Trip data is correctly scoped per authenticated user in Supabase
- Adaptive replanning maintains context across days without resetting the full itinerary
