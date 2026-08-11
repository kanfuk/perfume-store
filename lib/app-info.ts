export const appInfo = {
  name: "Smellme.cl",
  shortName: "Smellme",
  tagline: "Atrae sin decir una palabra.",
  version: "2.3.1",
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
