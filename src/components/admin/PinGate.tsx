"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearAdminUnlock,
  isAdminSessionUnlocked,
  persistAdminUnlock,
} from "@/lib/admin-pin";
import { unlockAdminByPin } from "@/lib/data";

const AdminLockContext = createContext<(() => void) | null>(null);

export function useAdminLock(): () => void {
  const lock = useContext(AdminLockContext);
  return useCallback(() => {
    if (lock) {
      lock();
      return;
    }
    clearAdminUnlock();
  }, [lock]);
}

export function PinGate({
  children,
  title = "Acesso admin",
  description = "Digite o PIN.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(isAdminSessionUnlocked());
  }, []);

  function handleLock() {
    clearAdminUnlock();
    setUnlocked(false);
    setPin("");
    setPinError(null);
  }

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPinError(null);
    try {
      const ok = await unlockAdminByPin(pin);
      if (!ok) {
        setPinError("PIN incorreto.");
        return;
      }
      persistAdminUnlock();
      setUnlocked(true);
      setPin("");
    } catch (err) {
      setPinError(
        err instanceof Error ? err.message : "Não foi possível entrar."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ADEF]">
            Central
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <form
          onSubmit={(e) => void handleUnlock(e)}
          className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5"
        >
          <label className="block text-sm font-medium text-slate-200">
            PIN
            <Input
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 border-white/15 bg-slate-950 text-white"
              placeholder="PIN"
              disabled={busy}
            />
          </label>
          {pinError ? (
            <p role="alert" className="text-sm text-red-300">
              {pinError}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Lock className="size-4" />
            )}
            Entrar
          </Button>
        </form>
      </div>
    );
  }

  return (
    <AdminLockContext.Provider value={handleLock}>
      {children}
    </AdminLockContext.Provider>
  );
}
