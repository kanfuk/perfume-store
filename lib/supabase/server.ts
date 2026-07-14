import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAdminKey,
  getSupabaseUrl
} from "@/lib/supabase/config";

export function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const adminKey = getSupabaseAdminKey();

  if (!url || !adminKey) {
    throw new Error(
      "Supabase administrativo no esta configurado. Define SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY en el servidor."
    );
  }

  return createClient(url, adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
