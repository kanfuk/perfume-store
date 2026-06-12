import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServerKey,
  getSupabaseUrl
} from "@/lib/supabase/config";

export function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const serverKey = getSupabaseServerKey();

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
