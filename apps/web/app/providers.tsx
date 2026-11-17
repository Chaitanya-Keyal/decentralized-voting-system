"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { useColorScheme } from "@/lib/color-scheme";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const scheme = useColorScheme();
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          // The wallet dialogs in the site's own colours rather than RainbowKit's blue, light or
          // dark as the page is.
          theme={
            scheme === "dark"
              ? darkTheme({
                  accentColor: "#f4f4f5",
                  accentColorForeground: "#18181b",
                  borderRadius: "medium",
                })
              : lightTheme({ accentColor: "#18181b", borderRadius: "medium" })
          }
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
