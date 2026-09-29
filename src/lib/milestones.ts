/** Thresholds for Dep. Estadual / Dep. Federal vote celebrations. */
export const MILESTONE_BASE = [50_000, 100_000, 150_000] as const;
export const MILESTONE_STEP_AFTER = 10_000;
export const MILESTONE_CARGOS = [
  "Deputado Estadual",
  "Deputado Federal",
] as const;

export function isMilestoneCargo(cargo: string): boolean {
  return (MILESTONE_CARGOS as readonly string[]).includes(cargo);
}

/** All thresholds crossed by `votos` (inclusive). */
export function milestonesReached(votos: number): number[] {
  if (!Number.isFinite(votos) || votos < MILESTONE_BASE[0]) return [];
  const out: number[] = [];
  for (const t of MILESTONE_BASE) {
    if (votos >= t) out.push(t);
  }
  if (votos >= 150_000) {
    for (let t = 160_000; t <= votos; t += MILESTONE_STEP_AFTER) {
      out.push(t);
    }
  }
  return out;
}

/** Natural PT-BR label for a threshold (e.g. 50 mil, 100.000). */
export function formatMilestoneLabel(votos: number): string {
  if (votos < 100_000 && votos % 1_000 === 0) {
    return `${votos / 1_000} mil`;
  }
  return new Intl.NumberFormat("pt-BR").format(votos);
}

export function milestoneMessage(votos: number): string {
  return `Passamos dos ${formatMilestoneLabel(votos)} votos`;
}

export function milestoneKey(candidatoId: string, threshold: number): string {
  return `${candidatoId}:${threshold}`;
}
