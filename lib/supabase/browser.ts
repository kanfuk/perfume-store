import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl
} from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  if (!url || !publishableKey) {
    throw new Error("Supabase no esta configurado en el navegador.");
  }

  return createBrowserClient(url, publishableKey);
}
