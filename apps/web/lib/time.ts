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

const shortFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "16 Nov, 21:41": for lists, where space is short. */
export function formatShort(seconds: number): string {
  return shortFormat.format(new Date(seconds * 1000));
}

/** "in 5 min", "1 h 10 min ago", "in 2 days" and so on: precise enough to plan by. */
export function formatRelative(seconds: number, now: number): string {
  const difference = seconds - now;
  const span = Math.abs(difference);
  let text: string;
  if (span < 60) text = `${span} s`;
  else if (span < 3_600) text = `${Math.round(span / 60)} min`;
  else if (span < 86_400) {
    const hours = Math.floor(span / 3_600);
    const minutes = Math.round((span % 3_600) / 60);
    text = minutes > 0 && hours < 10 ? `${hours} h ${minutes} min` : `${hours} h`;
  } else {
    const days = Math.round(span / 86_400);
    text = `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (span < 5) return "now";
  return difference > 0 ? `in ${text}` : `${text} ago`;
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
