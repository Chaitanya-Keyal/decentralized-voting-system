import type { ReactNode } from "react";

/** A page of plain text, such as the privacy and terms pages. */
export function Prose({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex max-w-2xl flex-col gap-3 text-zinc-700 dark:text-zinc-300 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_li]:mt-1.5 [&_strong]:font-medium [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h1>
      {children}
    </article>
  );
}
