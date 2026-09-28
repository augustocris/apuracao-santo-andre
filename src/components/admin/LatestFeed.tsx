"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/types";
import { cn, formatTime, formatVotes } from "@/lib/utils";

interface LatestFeedProps {
  feed: FeedItem[];
}

export function LatestFeed({ feed }: LatestFeedProps) {
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!primedRef.current) {
      feed.forEach((item) => seenRef.current.add(item.id));
      primedRef.current = true;
      return;
    }

    const newcomers = feed.filter((item) => !seenRef.current.has(item.id));
    if (newcomers.length === 0) return;

    newcomers.forEach((item) => seenRef.current.add(item.id));
    setFlashIds(new Set(newcomers.map((n) => n.id)));
    const timer = setTimeout(() => setFlashIds(new Set()), 1800);
    return () => clearTimeout(timer);
  }, [feed]);

  if (feed.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-400">
        Nenhum BU recebido ainda.
      </p>
    );
  }

  return (
    <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
      {feed.map((item) => (
        <li
          key={`${item.zona}-${item.secao}-${item.id}`}
          className={cn(
            "rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 transition duration-500",
            flashIds.has(item.id) &&
              "animate-pulse border-amber-400/60 bg-amber-500/15 ring-2 ring-amber-400/40"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{item.escola}</p>
              <p className="text-xs text-slate-400">
                Zona {item.zona} · Seção {item.secao}
                {item.fiscal_nome ? ` · ${item.fiscal_nome}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold tabular-nums text-teal-300">
                {formatVotes(item.totalVotos)}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatTime(item.created_at)}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
