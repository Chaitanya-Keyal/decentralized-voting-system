import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Header } from "@/components/header";
import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";
import { Providers } from "./providers";
import { description } from "./site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "DVote",
  title: { default: "DVote", template: "%s · DVote" },
  description,
  appleWebApp: { capable: true, title: "DVote", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ServiceWorker />
        <Providers>
          <Header />
          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
