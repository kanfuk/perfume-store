import { createClient } from "@supabase/supabase-js";

export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serverKey) {
    throw new Error("Supabase no esta configurado.");
  }

  return createClient(url, serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
