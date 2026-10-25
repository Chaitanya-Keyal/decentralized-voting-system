"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";

import { isLocalChain } from "./env";

/** Sepolia makes a block every twelve seconds; a little more allows for the request itself. */
const BLOCK_INTERVAL = 15;

/**
 * The current time in Unix seconds, as the chain sees it. On Anvil the chain's clock can be moved
 * ahead of the wall clock, and it keeps running while no blocks are mined, so this asks for the
 * pending block's time. Elsewhere the chain keeps to the wall clock, and the latest block is up to
 * a block interval old, so a small negative offset is its age rather than this device's clock.
 */
export function useChainNow(): number {
  const [wall, setWall] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setWall(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  const { data: offset } = useQuery({
    queryKey: ["chain-clock", block?.toString()],
    enabled: Boolean(client),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!client) throw new Error("Not ready");
      const asked = Math.floor(Date.now() / 1000);
      const next = await client.getBlock({ blockTag: isLocalChain ? "pending" : "latest" });
      return Number(next.timestamp) - asked;
    },
  });
  const blockAge = isLocalChain ? 0 : BLOCK_INTERVAL;
  return wall + (offset === undefined || (offset < 0 && offset >= -blockAge) ? 0 : offset);
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTime(seconds: number): string {
  return dateFormat.format(new Date(seconds * 1000));
}

/** "in 5 minutes", "2 hours ago" and so on. */
export function formatRelative(seconds: number, now: number): string {
  const difference = seconds - now;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(difference) >= size || unit === "second") {
      return format.format(Math.round(difference / size), unit);
    }
  }
  return "";
}

/** The value a `datetime-local` input expects, in the browser's time zone. */
export function toLocalInput(seconds: number): string {
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function fromLocalInput(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}
