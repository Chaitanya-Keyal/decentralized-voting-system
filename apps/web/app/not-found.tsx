import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        There is nothing at this address. If you followed a link to an election, check that the
        whole link was copied.
      </p>
      <LinkButton href="/">See all elections</LinkButton>
    </div>
  );
}
