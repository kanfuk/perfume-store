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
