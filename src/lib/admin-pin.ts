import { DEFAULT_CHEFE_PIN } from "@/lib/cargos";

/** Sessão do painel /admin — independente do /chefe. */
export const ADMIN_UNLOCK_KEY = "apuracao-sa-admin-unlock";

/**
 * PIN do Cristiano para o admin: `apuracao_config.chefe_pin` se preenchido,
 * senão `andre2026`. Nunca usa a tabela `chefes`.
 */
export function resolveAdminPin(configPin?: string | null): string {
  const fromConfig = configPin?.trim();
  return fromConfig || DEFAULT_CHEFE_PIN;
}

export function pinMatchesAdmin(
  input: string,
  configPin?: string | null
): boolean {
  const cleaned = input.trim();
  return cleaned.length > 0 && cleaned === resolveAdminPin(configPin);
}

export function isAdminSessionUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistAdminUnlock(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAdminUnlock(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}
