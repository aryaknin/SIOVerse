import type { Metadata, Viewport } from "next";
import { SioCursor } from "@/components/sio-cursor";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIO OS", template: "%s — SIO OS" },
  description: "Le bureau numérique de la communauté SIO.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SIOVerse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#07090d", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}<PwaRegistration /><SioCursor /></body>
    </html>
  );
}
