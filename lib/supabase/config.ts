function normalizeEnv(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function getSupabaseUrl() {
  return normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabasePublishableKey() {
  return normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseAdminKey() {
  return (
    normalizeEnv(process.env.SUPABASE_SECRET_KEY) ||
    normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
