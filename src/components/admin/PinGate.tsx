"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHEFE_SESSION_ID_KEY, CHEFE_UNLOCK_KEY } from "@/lib/cargos";
import { unlockChefeByPin } from "@/lib/data";

function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(CHEFE_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function PinGate({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPinError(null);
    try {
      const session = await unlockChefeByPin(pin);
      if (!session) {
        setPinError("PIN incorreto.");
        return;
      }
      try {
        sessionStorage.setItem(CHEFE_UNLOCK_KEY, "1");
        sessionStorage.setItem(CHEFE_SESSION_ID_KEY, session.id);
      } catch {
        /* ignore */
      }
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
      <form
        onSubmit={(e) => void handleUnlock(e)}
        className="mx-auto max-w-md space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5"
      >
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
        <label className="block text-sm font-medium text-slate-200">
          PIN do chefe / central
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
          <Lock className="size-4" />
          Entrar
        </Button>
      </form>
    );
  }

  return <>{children}</>;
}
