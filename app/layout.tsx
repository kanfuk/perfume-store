import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pauli Store",
  description: "Pedidos caseros hechos con dedicacion para compartir, regalar o disfrutar en casa.",
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml"
      },
      {
        url: "/favicon.ico"
      }
    ]
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
