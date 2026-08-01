export const appInfo = {
  name: "Smellme.cl",
  shortName: "Smellme",
  tagline: "Perfumes, testers y fragancias exclusivas",
  version: "2.0.0-rc.3",
  developer: "Riedmann Apps",
  copyright: "Todos los derechos reservados"
} as const;

export function getFooterLines() {
  return [
    appInfo.name,
    `Desarrollado por ${appInfo.developer}`,
    appInfo.copyright
  ] as const;
}
