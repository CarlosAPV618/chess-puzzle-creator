import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "~/components/app-shell";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "Chess Puzzle Creator", template: "%s · Chess Puzzle Creator" },
  description: "Analiza tus partidas y practica tus propios errores",
  applicationName: "Chess Puzzle Creator",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Chess Puzzle", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d1310",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <TRPCReactProvider>
          <AppShell>{children}</AppShell>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
