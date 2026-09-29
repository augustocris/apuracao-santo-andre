"use client";

import { useEffect, useRef, useState } from "react";
import {
  isMilestoneCargo,
  milestoneKey,
  milestoneMessage,
  milestonesReached,
  type MilestoneCelebrationEvent,
} from "@/lib/milestones";
import type { CargoRanking } from "@/lib/types";

interface UseMilestoneCelebrationsArgs {
  rankingsByCargo: CargoRanking[];
  enabled?: boolean;
}

/**
 * Detects newly crossed Dep. Estadual / Dep. Federal thresholds and exposes
 * a queued celebration. Confetti + label render inside the matching telão card.
 * Never falls back to a generic milestone label — always the candidate name.
 */
export function useMilestoneCelebrations({
  rankingsByCargo,
  enabled = true,
}: UseMilestoneCelebrationsArgs): MilestoneCelebrationEvent | null {
  const firedRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const [active, setActive] = useState<MilestoneCelebrationEvent | null>(null);
  const queueRef = useRef<MilestoneCelebrationEvent[]>([]);
  const showingRef = useRef(false);

  const demoFiredRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (demoFiredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demoCelebrate") !== "1") return;

    const threshold = Number(params.get("demoThreshold") || "50000");
    const value = Number.isFinite(threshold) ? threshold : 50_000;
    const demoName = params.get("demoName")?.trim() || "";
    const demoCargoParam = params.get("demoCargo")?.trim() || "";

    let target: MilestoneCelebrationEvent | null = null;
    for (const group of rankingsByCargo) {
      if (!isMilestoneCargo(group.cargo)) continue;
      if (demoCargoParam && group.cargo !== demoCargoParam) continue;
      for (const row of group.rankings) {
        if (demoName && row.candidato.nome !== demoName) continue;
        target = {
          id: `demo:${row.candidato.id}:${value}`,
          candidatoId: row.candidato.id,
          candidateName: row.candidato.nome,
          message: milestoneMessage(value),
          cargo: group.cargo,
        };
        break;
      }
      if (target) break;
    }

    if (!target) {
      const group =
        rankingsByCargo.find((g) => isMilestoneCargo(g.cargo)) ?? null;
      const row = group?.rankings[0];
      if (!row) return;
      target = {
        id: `demo:${row.candidato.id}:${value}`,
        candidatoId: row.candidato.id,
        candidateName: demoName || row.candidato.nome,
        message: milestoneMessage(value),
        cargo: group!.cargo,
      };
    }

    if (!target.candidateName.trim()) return;
    demoFiredRef.current = true;

    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      showingRef.current = true;
      setActive(target);
      window.setTimeout(() => {
        if (cancelled) return;
        setActive(null);
        showingRef.current = false;
      }, 4200);
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [enabled, rankingsByCargo]);

  useEffect(() => {
    if (!enabled) return;
    const pending: MilestoneCelebrationEvent[] = [];

    for (const group of rankingsByCargo) {
      if (!isMilestoneCargo(group.cargo)) continue;
      for (const row of group.rankings) {
        const crossed = milestonesReached(row.votos);
        for (const threshold of crossed) {
          const key = milestoneKey(row.candidato.id, threshold);
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          if (primedRef.current) {
            const name = row.candidato.nome?.trim();
            if (!name) continue;
            pending.push({
              id: key,
              candidatoId: row.candidato.id,
              candidateName: name,
              message: milestoneMessage(threshold),
              cargo: group.cargo,
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
      window.setTimeout(() => {
        setActive(null);
        showingRef.current = false;
        drain();
      }, 4200);
    };
    drain();
  }, [enabled, rankingsByCargo]);

  return active;
}
