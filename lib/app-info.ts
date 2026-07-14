export const appInfo = {
  name: "Pauli Store",
  version: "1.2.0",
  developer: "RiedmannsApps",
  copyright: "Todos los derechos reservados"
} as const;

export function getFooterLines() {
  return [
    appInfo.name,
    `Desarrollado por ${appInfo.developer}`,
    appInfo.copyright
  ] as const;
}
