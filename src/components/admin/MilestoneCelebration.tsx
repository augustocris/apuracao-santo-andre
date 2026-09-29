"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadFiredMilestones,
  markMilestoneFired,
  persistFiredMilestones,
} from "@/lib/milestone-storage";
import {
  isMilestoneCargo,
  milestoneMessage,
  milestonesReached,
  type MilestoneCelebrationEvent,
} from "@/lib/milestones";
import type { CargoRanking } from "@/lib/types";

interface UseMilestoneCelebrationsArgs {
  rankingsByCargo: CargoRanking[];
  enabled?: boolean;
  /** True after the first successful dashboard fetch (hydrate). */
  ready?: boolean;
}

/**
 * Detects newly crossed Dep. Estadual / Dep. Federal thresholds and exposes
 * a queued celebration. Confetti + label render inside the matching telão card.
 *
 * Fired milestones are persisted in sessionStorage so remount / reopen of the
 * telão does not replay. Celebrations are skipped until the first hydrate
 * ("armed"); only subsequent live deltas can fire confetti.
 */
export function useMilestoneCelebrations({
  rankingsByCargo,
  enabled = true,
  ready = true,
}: UseMilestoneCelebrationsArgs): MilestoneCelebrationEvent | null {
  const firedRef = useRef<Set<string> | null>(null);
  const armedRef = useRef(false);
  const [active, setActive] = useState<MilestoneCelebrationEvent | null>(null);
  const queueRef = useRef<MilestoneCelebrationEvent[]>([]);
  const showingRef = useRef(false);

  const demoFiredRef = useRef(false);

  function getFired(): Set<string> {
    if (firedRef.current === null) {
      firedRef.current = loadFiredMilestones();
    }
    return firedRef.current;
  }

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
    if (!enabled || !ready) return;
    const fired = getFired();
    const pending: MilestoneCelebrationEvent[] = [];

    for (const group of rankingsByCargo) {
      if (!isMilestoneCargo(group.cargo)) continue;
      for (const row of group.rankings) {
        const crossed = milestonesReached(row.votos);
        for (const threshold of crossed) {
          const isNew = markMilestoneFired(fired, row.candidato.id, threshold);
          if (!isNew) continue;
          if (!armedRef.current) continue;
          const name = row.candidato.nome?.trim();
          if (!name) continue;
          pending.push({
            id: `${row.candidato.id}:${threshold}`,
            candidatoId: row.candidato.id,
            candidateName: name,
            message: milestoneMessage(threshold),
            cargo: group.cargo,
          });
        }
      }
    }

    // First ready pass: seed storage with already-crossed thresholds, no party.
    if (!armedRef.current) {
      armedRef.current = true;
      persistFiredMilestones(fired);
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
  }, [enabled, ready, rankingsByCargo]);

  return active;
}
