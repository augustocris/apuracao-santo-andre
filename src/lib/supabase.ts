import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabaseEnv()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (typeof window === "undefined") {
    return createClient(url, key);
  }

  if (!browserClient) {
    browserClient = createClient(url, key);
  }
  return browserClient;
}
