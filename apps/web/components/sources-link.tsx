"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import type { Source } from "@/lib/sources";

import { ExternalLink } from "./ui";

/**
 * A link to something a reader can see for themselves in more than one place, such as two block
 * explorers or two IPFS gateways. It opens a small menu of those places, each in a new tab. With
 * one place it is a plain link, and with none it is just its text.
 */
export function SourcesLink({ sources, children }: { sources: Source[]; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const anchor = `--sources-${id.replace(/[^\w-]/g, "")}`;

  // Where the browser cannot anchor the menu to its link in CSS, place it under the link by hand.
  useEffect(() => {
    const element = menu.current;
    if (!element || CSS.supports("anchor-name", "--sources")) return;
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open" || !trigger.current) return;
      const box = trigger.current.getBoundingClientRect();
      const left = Math.min(box.left, window.innerWidth - element.offsetWidth - 8);
      element.style.top = `${box.bottom + 4}px`;
      element.style.left = `${Math.max(8, left)}px`;
    };
    element.addEventListener("toggle", place);
    return () => element.removeEventListener("toggle", place);
  }, [sources.length]);

  const [only, ...others] = sources;
  if (!only) return <>{children}</>;
  if (others.length === 0) return <ExternalLink href={only.href}>{children}</ExternalLink>;

  const menuId = `${id}-sources`;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="true"
        style={{ anchorName: anchor }}
        className="cursor-pointer underline underline-offset-2 hover:text-zinc-900 hover:decoration-2 dark:hover:text-zinc-100"
      >
        {children}
        <ChevronDown aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />
      </button>
      <span
        ref={menu}
        id={menuId}
        popover="auto"
        style={{ positionAnchor: anchor }}
        className="[inset:auto] m-0 mt-1 w-max max-w-72 rounded-lg border border-zinc-200 bg-white p-1 text-left text-sm text-zinc-700 shadow-lg [position-area:bottom_span-right] [position-try-fallbacks:flip-block,flip-inline] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
      >
        <span className="block px-2.5 pt-1 pb-1.5 text-xs text-zinc-500">Open on</span>
        {sources.map((source) => (
          <a
            key={source.href}
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => menu.current?.hidePopover()}
            className="flex items-start justify-between gap-4 rounded-md px-2.5 py-1.5 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:hover:bg-zinc-900 dark:focus-visible:bg-zinc-900"
          >
            <span>
              <span className="block text-zinc-900 dark:text-zinc-100">{source.name}</span>
              {source.note && <span className="block text-xs text-zinc-500">{source.note}</span>}
            </span>
            <ArrowUpRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ))}
      </span>
    </>
  );
}
