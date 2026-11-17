"use client";

// Light or dark. The site follows the system's setting unless the visitor picks the other one with
// the header's switch. The choice is kept in localStorage and written to
// <meta name="color-scheme">, which globals.css maps to the color-scheme property that every
// colour follows; the layout's inline script applies a kept choice before the page is drawn.
import { useEffect, useSyncExternalStore } from "react";

type Scheme = "light" | "dark";

const KEY = "color-scheme";
const CHANGE_EVENT = "dvote-color-scheme";
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

function kept(): Scheme | undefined {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined;
  }
}

function system(): Scheme {
  return systemDark().matches ? "dark" : "light";
}

/** Shows `choice`, or follows the system with none, and colours the browser's toolbar to match. */
function apply(choice: Scheme | undefined) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="color-scheme"]')) {
    meta.content = choice ?? "light dark";
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const forDark = meta.media.includes("dark");
    meta.content = (choice ? choice === "dark" : forDark) ? "#09090b" : "#ffffff";
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Switches to the opposite of what the page shows. Switching back to what the system shows forgets
 * the choice, so the page follows the system again rather than being pinned to it.
 */
export function toggleColorScheme(): void {
  const target: Scheme = (kept() ?? system()) === "dark" ? "light" : "dark";
  const choice = target === system() ? undefined : target;
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable; the switch still applies to this page.
  }
  apply(choice);
}

function subscribe(onChange: () => void) {
  const media = systemDark();
  window.addEventListener(CHANGE_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

/** The scheme the page shows now, for parts drawn outside CSS: wallet dialogs, Google's button. */
export function useColorScheme(): Scheme {
  return useSyncExternalStore(
    subscribe,
    () => kept() ?? system(),
    () => "light",
  );
}

/** Keeps the toolbar colour right, and follows a choice made in another tab. */
export function useColorSchemeSync(): void {
  useEffect(() => {
    apply(kept());
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) apply(kept());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
