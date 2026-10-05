# Thanjai Healthy Plate

Food ordering web app for a healthy meal box business in Thanjavur, Tamil Nadu.

## Tech stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4 (theme tokens in `app/globals.css`)
- Supabase (Auth, PostgreSQL, Storage) — **not yet connected**, see below
- React Hook Form + Zod — added when the first form (checkout/admin) is built

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/                  Routes (customer pages, admin dashboard, API routes)
components/ui/        shadcn/ui primitives
components/shared/    Reusable app-specific components (BoxCard, OrderSummary, ...)
lib/business-logic/   Framework-agnostic business rules (pricing, cutoff time, offers)
lib/supabase/         Supabase client setup (added once a project is connected)
lib/types/            Shared TypeScript types
```

## Supabase

This project uses **only Supabase** for auth, database, and file storage — no other
database is used, and no Supabase project has been created on your behalf.

To connect your own Supabase project:

1. Copy `.env.example` to `.env.local`.
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from your Supabase project's **Project Settings > API**.
3. Never commit `.env.local`. The service role key isn't used anywhere in
   this codebase yet — it will only be added, deliberately, when a
   specific server-only feature needs it.

Until this is configured, the app runs with static sample data only.
