import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isConfiguredValue(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (v === "undefined" || v === "null") return false;
  if (/YOUR_PROJECT|YOUR_ANON|changeme|example\.com/i.test(v)) return false;
  return true;
}

/** True only when both public Supabase env vars look real (not placeholders). */
export function hasSupabaseEnv(): boolean {
  return (
    isConfiguredValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isConfiguredValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabaseEnv()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  if (typeof window === "undefined") {
    return createClient(url, key);
  }

  if (!browserClient) {
    browserClient = createClient(url, key);
  }
  return browserClient;
}

/** Prefer this when a write must hit the database — never silently use mock. */
export function requireSupabase(): SupabaseClient {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel (Production), faça Redeploy e atualize a página."
    );
  }
  return client;
}
