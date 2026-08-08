export type InviteSessionAuth = {
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: unknown }>;
  getSession: () => Promise<{
    data: { session: unknown | null };
    error?: unknown;
  }>;
};

/**
 * Consume el fragmento implicit de Supabase solo en memoria. Los tokens se
 * entregan directamente al cliente Auth y el hash se elimina antes de mostrar
 * el formulario; nunca se loggean ni se envian a endpoints propios.
 */
export async function resolveAdminPasswordSession(
  auth: InviteSessionAuth,
  hash: string,
  clearFragment: () => void
) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalizedHash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const containsTokenField = params.has("access_token") || params.has("refresh_token");

  if (containsTokenField) {
    if (!accessToken || !refreshToken) {
      clearFragment();
      return false;
    }

    try {
      const { error } = await auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      clearFragment();
      if (error) return false;
    } catch {
      clearFragment();
      return false;
    }
  } else if (normalizedHash) {
    clearFragment();
  }

  try {
    const { data, error } = await auth.getSession();
    return !error && Boolean(data.session);
  } catch {
    return false;
  }
}
