const STABLE_VERCEL_ORIGIN = "https://smellme-store.vercel.app";
const STABLE_VERCEL_HOSTNAME = new URL(STABLE_VERCEL_ORIGIN).hostname;

/**
 * Origen publico unico de Smellme.
 *
 * Un dominio personalizado solo debe configurarse cuando ya resuelva en
 * produccion. Los dominios vercel.app distintos del alias estable se ignoran
 * para que un Preview o hash de deployment nunca llegue a clientes.
 */
export function resolvePublicOrigin(configuredOrigin?: string | null) {
  const candidate = configuredOrigin?.trim();

  if (candidate) {
    try {
      const url = new URL(candidate);
      const isStableVercelHost = url.hostname === STABLE_VERCEL_HOSTNAME;
      const isOtherVercelHost = url.hostname.endsWith(".vercel.app") && !isStableVercelHost;

      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !isOtherVercelHost
      ) {
        return url.origin;
      }
    } catch {
      // Una configuracion invalida cae de forma segura en el alias estable.
    }
  }

  return STABLE_VERCEL_ORIGIN;
}

export const publicOrigin = resolvePublicOrigin(
  process.env.NEXT_PUBLIC_SITE_URL?.trim()
);

export function getPublicUrl(path = "/") {
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  return new URL(normalizedPath, `${publicOrigin}/`).toString();
}

export function getStorefrontUrl() {
  return getPublicUrl("/");
}

export function getAdminUrl(path = "/admin") {
  const normalizedPath = path.startsWith("/admin") ? path : `/admin/${path.replace(/^\/+/, "")}`;
  return getPublicUrl(normalizedPath);
}
