type AppFooterProps = {
  className?: string;
};

export function AppFooter({ className = "" }: AppFooterProps) {
  return (
    <footer
      className={`py-6 text-center text-xs text-[#8b6a74] ${className}`.trim()}
    >
      App creada por Rodrigo Riedmann · Todos los derechos reservados.
    </footer>
  );
}
