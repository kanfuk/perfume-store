import type { Metadata, Viewport } from "next";
import { AppFeedbackProvider } from "@/components/ui/AppFeedbackProvider";
import { appInfo } from "@/lib/app-info";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://smellme.cl"),
  applicationName: appInfo.name,
  title: {
    default: `${appInfo.name} — ${appInfo.tagline}`,
    template: `%s · ${appInfo.name}`
  },
  description: appInfo.tagline,
  keywords: ["perfumes", "fragancias", "testers", "Smellme", "perfumería"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "/",
    siteName: appInfo.name,
    title: `${appInfo.name} — ${appInfo.tagline}`,
    description: appInfo.tagline,
    images: [{ url: "/brand/smellme-social.jpg", width: 1200, height: 630, alt: "Smellme.cl" }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${appInfo.name} — ${appInfo.tagline}`,
    description: appInfo.tagline,
    images: ["/brand/smellme-social.jpg"]
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: appInfo.name,
    statusBarStyle: "black-translucent"
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
  themeColor: "#0B0B0B",
  colorScheme: "light"
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
