export const appInfo = {
  name: "Smellme.cl",
  shortName: "Smellme",
  tagline: "Perfumes, testers y fragancias exclusivas",
  version: "1.2.0",
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
