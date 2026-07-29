import { RiedmannsBranding } from "@/components/RiedmannsBranding";

type AppFooterProps = {
  className?: string;
  showClientCta?: boolean;
};

export function AppFooter({
  className = "",
  showClientCta = false
}: AppFooterProps) {
  return (
    <footer id="site-footer" className={className}>
      <RiedmannsBranding variant={showClientCta ? "client" : "admin"} />
    </footer>
  );
}
