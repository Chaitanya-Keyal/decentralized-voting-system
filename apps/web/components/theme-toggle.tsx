"use client";

import { Moon, Sun } from "lucide-react";

import { toggleColorScheme, useColorSchemeSync } from "@/lib/color-scheme";

/**
 * Switches between light and dark. Both labels are in the markup and CSS shows the one for the
 * scheme on screen, so the button is right before any script runs and when the system changes.
 */
export function ThemeToggle() {
  useColorSchemeSync();
  return (
    <button
      type="button"
      onClick={toggleColorScheme}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 pointer-coarse:size-10"
    >
      <span className="dark:hidden">
        <Moon aria-hidden className="size-4" />
        <span className="sr-only">Switch to dark mode</span>
      </span>
      <span className="hidden dark:inline">
        <Sun aria-hidden className="size-4" />
        <span className="sr-only">Switch to light mode</span>
      </span>
    </button>
  );
}
