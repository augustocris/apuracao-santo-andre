"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  isMilestoneCargo,
  milestoneKey,
  milestoneMessage,
  milestonesReached,
} from "@/lib/milestones";
import type { CargoRanking } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Celebration {
  id: string;
  message: string;
}

interface MilestoneCelebrationProps {
  rankingsByCargo: CargoRanking[];
}

function fireConfettiBurst() {
  const count = 160;
  const defaults = {
    origin: { y: 0.55 },
    zIndex: 80,
    disableForReducedMotion: true,
  };

  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.35),
    spread: 55,
    startVelocity: 45,
  });
  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.3),
    angle: 60,
    spread: 65,
    origin: { x: 0, y: 0.65 },
  });
  confetti({
    ...defaults,
    particleCount: Math.floor(count * 0.3),
    angle: 120,
    spread: 65,
    origin: { x: 1, y: 0.65 },
  });
}

export function MilestoneCelebration({
  rankingsByCargo,
}: MilestoneCelebrationProps) {
  const firedRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const [active, setActive] = useState<Celebration | null>(null);
  const queueRef = useRef<Celebration[]>([]);
  const showingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demoCelebrate") !== "1") return;
    const threshold = Number(params.get("demoThreshold") || "50000");
    const key = `demo:${Number.isFinite(threshold) ? threshold : 50_000}`;
    if (firedRef.current.has(key)) return;
    firedRef.current.add(key);
    const t = window.setTimeout(() => {
      showingRef.current = true;
      setActive({
        id: key,
        message: milestoneMessage(
          Number.isFinite(threshold) ? threshold : 50_000
        ),
      });
      fireConfettiBurst();
      window.setTimeout(() => {
        setActive(null);
        showingRef.current = false;
      }, 4200);
    }, 700);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const pending: Celebration[] = [];

    for (const group of rankingsByCargo) {
      if (!isMilestoneCargo(group.cargo)) continue;
      for (const row of group.rankings) {
        const crossed = milestonesReached(row.votos);
        for (const threshold of crossed) {
          const key = milestoneKey(row.candidato.id, threshold);
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          // Prime on first snapshot: mark already-crossed without celebrating.
          if (primedRef.current) {
            pending.push({
              id: key,
              message: milestoneMessage(threshold),
            });
          }
        }
      }
    }

    if (!primedRef.current) {
      primedRef.current = true;
      return;
    }

    if (pending.length === 0) return;

    queueRef.current.push(...pending);
    const drain = () => {
      if (showingRef.current) return;
      const next = queueRef.current.shift();
      if (!next) return;
      showingRef.current = true;
      setActive(next);
      fireConfettiBurst();
      window.setTimeout(() => {
        setActive(null);
        showingRef.current = false;
        drain();
      }, 4200);
    };
    drain();
  }, [rankingsByCargo]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[18%] z-50 flex justify-center px-4"
    >
      <div
        className={cn(
          "animate-in fade-in zoom-in-95 duration-500",
          "rounded-2xl border border-amber-300/50 bg-slate-950/90 px-8 py-5 text-center shadow-[0_0_48px_rgba(251,191,36,0.35)] backdrop-blur-md"
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
          Marco atingido
        </p>
        <p className="mt-2 text-2xl font-bold text-white md:text-4xl">
          {active.message}
        </p>
      </div>
    </div>
  );
}
