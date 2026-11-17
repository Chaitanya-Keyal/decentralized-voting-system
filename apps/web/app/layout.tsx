import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { Header } from "@/components/header";
import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";
import { Providers } from "./providers";
import { description } from "./site";

const APPLY_KEPT_COLOR_SCHEME = `try{var s=localStorage.getItem("color-scheme");if(s==="light"||s==="dark")document.querySelectorAll('meta[name="color-scheme"]').forEach(function(m){m.content=s})}catch(e){}`;

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
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Applies a light or dark choice kept by lib/color-scheme.ts before anything is drawn. It
            runs first in the body, where the head's color-scheme meta exists, and does nothing
            else, so it stays this small. */}
        <script dangerouslySetInnerHTML={{ __html: APPLY_KEPT_COLOR_SCHEME }} />
        <ServiceWorker />
        <a
          href="#main"
          className="sr-only rounded-lg bg-white px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 dark:bg-zinc-900"
        >
          Skip to the main content
        </a>
        <Providers>
          <Header />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 focus:outline-none"
          >
            {children}
          </main>
          <footer className="mx-auto w-full max-w-4xl px-4 pb-6 text-sm text-zinc-500 dark:text-zinc-400">
            <nav aria-label="About DVote" className="flex gap-4">
              <Link href="/about" className="hover:underline">
                How it works
              </Link>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
            </nav>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
