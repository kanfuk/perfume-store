import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pauli Store",
  description: "Pedidos caseros de forma rapida y simple."
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
