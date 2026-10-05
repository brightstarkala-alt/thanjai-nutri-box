import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client, for use in Client Components.
// Not imported anywhere yet — inert until a real Supabase project's URL
// and anon key are set in .env.local and a page starts using it.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
