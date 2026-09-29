import { milestoneKey } from "@/lib/milestones";

const STORAGE_KEY = "apuracao:milestone-fired:v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Load previously fired milestone keys (candidatoId:threshold) for this browser tab session. */
export function loadFiredMilestones(): Set<string> {
  const out = new Set<string>();
  if (!canUseStorage()) return out;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return out;
    for (const item of parsed) {
      if (typeof item === "string" && item.includes(":")) out.add(item);
    }
  } catch {
    /* ignore corrupt storage */
  }
  return out;
}

export function persistFiredMilestones(keys: Set<string>): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* quota / private mode */
  }
}

export function markMilestoneFired(
  fired: Set<string>,
  candidatoId: string,
  threshold: number
): boolean {
  const key = milestoneKey(candidatoId, threshold);
  if (fired.has(key)) return false;
  fired.add(key);
  persistFiredMilestones(fired);
  return true;
}
