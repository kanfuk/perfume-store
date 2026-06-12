function readEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function getSupabaseUrl() {
  return readEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey() {
  return readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServerKey() {
  return (
    readEnv("SUPABASE_SECRET_KEY") ||
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getSupabasePublishableKey()
  );
}
