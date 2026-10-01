"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHEFE_UNLOCK_KEY, resolveChefePin } from "@/lib/cargos";
import { getConfig } from "@/lib/data";

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
  const [expectedPin, setExpectedPin] = useState(resolveChefePin(null));

  useEffect(() => {
    setUnlocked(isUnlocked());
    void (async () => {
      try {
        const cfg = await getConfig();
        setExpectedPin(resolveChefePin(cfg.chefe_pin));
      } catch {
        setExpectedPin(resolveChefePin(null));
      }
    })();
  }, []);

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (pin.trim() === expectedPin) {
      try {
        sessionStorage.setItem(CHEFE_UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
      setPinError(null);
      setPin("");
    } else {
      setPinError("PIN incorreto.");
    }
  }

  if (!unlocked) {
    return (
      <form
        onSubmit={handleUnlock}
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
          />
        </label>
        {pinError ? (
          <p role="alert" className="text-sm text-red-300">
            {pinError}
          </p>
        ) : null}
        <Button
          type="submit"
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
