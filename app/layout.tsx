import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pauli Store",
  description: "Pedidos caseros de Pauli Store",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png"
  }
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
