// Small UI building blocks, styled with Tailwind, with icons from lucide-react.
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  cloneElement,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Secondary text, readable on both the light and the dark background. */
export const muted = "text-zinc-500 dark:text-zinc-400";

const buttonStyles = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger: "bg-red-600 text-white hover:bg-red-500",
} as const;

// Taller on touch screens, so that a finger finds the target.
const buttonSizes = {
  md: "px-4 py-2 pointer-coarse:min-h-11",
  sm: "px-3 py-1.5 pointer-coarse:min-h-10",
} as const;

interface ButtonLook {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof buttonSizes;
}

/** A button's classes, for elements that must look like one, such as a file input's label. */
export function buttonClass({ variant = "primary", size = "md" }: ButtonLook = {}): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.98]",
    buttonSizes[size],
    buttonStyles[variant],
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook) {
  return (
    <button type="button" className={cx(buttonClass({ variant, size }), className)} {...props} />
  );
}

/** A link that looks like a button. */
export function LinkButton({
  href,
  variant,
  size,
  children,
}: ButtonLook & { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(buttonClass({ variant, size }), "w-fit")}>
      {children}
    </Link>
  );
}

/** A button that reads as a link inside a sentence. */
export function TextButton({
  tone = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer underline underline-offset-2 hover:decoration-2 disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger"
          ? "text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          : "hover:text-zinc-900 dark:hover:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
}

/** A link to another site, such as a block explorer, opened in a new tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-zinc-900 hover:decoration-2 dark:hover:text-zinc-100"
    >
      {children}
      <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5 align-[-0.125em]" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

const cardStyles =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

export function Card({
  title,
  description,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(cardStyles, "p-5", className)}>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      )}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

/** Content behind a summary line, open on request. With `card`, it sits in a card of its own. */
export function Disclosure({
  summary,
  card = false,
  children,
}: {
  summary: ReactNode;
  card?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={cx("group/disclosure text-sm", card && cx(cardStyles, "px-5 py-4"))}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-zinc-800 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 transition-transform group-open/disclosure:rotate-90 motion-reduce:transition-none rtl:-scale-x-100"
        />
        {summary}
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-zinc-600 dark:text-zinc-400">{children}</div>
    </details>
  );
}

/** A card-like option around a radio button or checkbox, marked when chosen. */
export const choiceCard =
  "flex cursor-pointer gap-3 rounded-lg border border-zinc-300 px-4 py-3 text-sm transition-colors hover:bg-zinc-50 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-100 has-[:checked]:ring-1 has-[:checked]:ring-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800 dark:has-[:checked]:ring-zinc-100";

// The border keeps 3:1 contrast with the page so the field can be found, and the text is 16px on
// phones, below which iOS zooms into a field when it is tapped. Focus shows the shared outline.
const fieldStyles =
  "w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-base sm:text-sm pointer-coarse:min-h-12 dark:bg-zinc-900";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // The default height gives way to any height the caller sets.
  return <textarea className={cx(fieldStyles, className ?? "min-h-24")} {...props} />;
}

/**
 * A labelled form control. The label names the control through `for`, and the hint, above the
 * control where autofill suggestions cannot cover it, describes it.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-zinc-600 dark:text-zinc-400">
          {hint}
        </p>
      )}
      {cloneElement(children, { id, "aria-describedby": hint ? hintId : undefined })}
    </div>
  );
}

const noticeTones = {
  info: {
    icon: Info,
    style:
      "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200",
  },
  success: {
    icon: CircleCheck,
    style:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  warning: {
    icon: TriangleAlert,
    style:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  error: {
    icon: CircleAlert,
    style:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  },
} satisfies Record<string, { icon: LucideIcon; style: string }>;

/** A message in a box, its tone shown by an icon as well as its colour. `busy` shows a spinner. */
export function Notice({
  tone = "info",
  busy = false,
  children,
}: {
  tone?: keyof typeof noticeTones;
  busy?: boolean;
  children: ReactNode;
}) {
  const { icon: Icon, style } = noticeTones[tone];
  return (
    <div
      className={cx("flex gap-2.5 rounded-lg border px-4 py-3 text-sm wrap-break-word", style)}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 flex">
        {busy ? <Spinner /> : <Icon aria-hidden className="size-4 shrink-0" />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A line saying what is loading. The spinner is a native progress bar without a value, which
 * assistive technology announces as busy, so the line needs no live region.
 */
export function Loading({ children }: { children: string }) {
  return (
    <p className={cx("flex items-center gap-2 text-sm", muted)}>
      <Spinner label={children} />
      <span aria-hidden>{children}</span>
    </p>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "done" | "muted";
}) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    live: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
    done: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
    muted: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  };
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

/**
 * An indeterminate native progress bar drawn as a spinner (`.spinner` in globals.css). With a
 * label it stands on its own; without one it accompanies text that says what is happening.
 */
export function Spinner({ label }: { label?: string }) {
  return label ? (
    <progress className="spinner" aria-label={label} />
  ) : (
    <progress className="spinner" aria-hidden />
  );
}

/** A shortened address or hash, with the full value on hover. */
export function Mono({ value, short = true }: { value: string; short?: boolean }) {
  const text = short && value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  return (
    <code
      title={value}
      className={`font-mono text-xs ${text === value ? "break-all" : "whitespace-nowrap"}`}
    >
      {text}
    </code>
  );
}
