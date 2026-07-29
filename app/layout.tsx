import type { Metadata, Viewport } from "next";
import { AppFeedbackProvider } from "@/components/ui/AppFeedbackProvider";
import { appInfo } from "@/lib/app-info";
import "./globals.css";

export const metadata: Metadata = {
  title: `${appInfo.name} — ${appInfo.tagline}`,
  description: "Perfumes, testers y fragancias exclusivas a precio conveniente.",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: appInfo.name,
    statusBarStyle: "default"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48x48.png", sizes: "48x48", type: "image/png" }
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
    other: [
      {
        rel: "icon",
        url: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        rel: "icon",
        url: "/icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        rel: "msapplication-TileImage",
        url: "/icons/mstile-150x150.png"
      }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#17191f"
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body><AppFeedbackProvider>{children}</AppFeedbackProvider></body>
    </html>
  );
}
