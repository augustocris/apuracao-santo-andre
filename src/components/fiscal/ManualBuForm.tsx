"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ClipboardList, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARGOS_FISCAL_ORDEM, labelCargoCurto } from "@/lib/cargos";
import { listCandidatos } from "@/lib/data";
import type { Candidato } from "@/lib/types";

export interface ManualBuSubmit {
  zona: string;
  secao: string;
  votes: Array<{ candidatoId: string; numero: string; quantidade: number }>;
}

interface ManualBuFormProps {
  onSubmit: (payload: ManualBuSubmit) => void;
  busy?: boolean;
  /** Increment to clear zona/seção/votos after a successful transmit. */
  resetKey?: number;
}

function sortCandidatosFiscais(list: Candidato[]): Candidato[] {
  const order = new Map(
    CARGOS_FISCAL_ORDEM.map((cargo, index) => [cargo, index] as const)
  );
  return [...list]
    .filter((c) => order.has(c.cargo as (typeof CARGOS_FISCAL_ORDEM)[number]))
    .sort((a, b) => {
      const oa = order.get(a.cargo as (typeof CARGOS_FISCAL_ORDEM)[number]) ?? 99;
      const ob = order.get(b.cargo as (typeof CARGOS_FISCAL_ORDEM)[number]) ?? 99;
      if (oa !== ob) return oa - ob;
      return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    });
}

export function ManualBuForm({ onSubmit, busy, resetKey = 0 }: ManualBuFormProps) {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zona, setZona] = useState("");
  const [secao, setSecao] = useState("");
  const [votos, setVotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await listCandidatos({ activeRaceOnly: true });
        if (cancelled) return;
        const sorted = sortCandidatosFiscais(list);
        setCandidatos(sorted);
        setVotos((prev) => {
          const next: Record<string, string> = {};
          for (const c of sorted) {
            next[c.id] = prev[c.id] ?? "";
          }
          return next;
        });
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar candidatos cadastrados."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resetKey === 0) return;
    setZona("");
    setSecao("");
    setVotos((prev) => {
      const next: Record<string, string> = {};
      for (const id of Object.keys(prev)) {
        next[id] = "";
      }
      return next;
    });
  }, [resetKey]);

  const grouped = useMemo(() => {
    return CARGOS_FISCAL_ORDEM.map((cargo) => ({
      cargo,
      items: candidatos.filter((c) => c.cargo === cargo),
    })).filter((g) => g.items.length > 0);
  }, [candidatos]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const z = zona.replace(/\D/g, "");
    const s = secao.replace(/\D/g, "");
    if (!z || !s) return;

    const votes: ManualBuSubmit["votes"] = [];
    for (const c of candidatos) {
      const raw = votos[c.id]?.trim() ?? "";
      if (raw === "") continue;
      const quantidade = Number.parseInt(raw, 10);
      if (!Number.isFinite(quantidade) || quantidade < 0) {
        return;
      }
      votes.push({
        candidatoId: c.id,
        numero: c.numero,
        quantidade,
      });
    }

    if (votes.length === 0) return;

    onSubmit({ zona: z, secao: s, votes });
  }

  const canSubmit =
    zona.replace(/\D/g, "").length > 0 &&
    secao.replace(/\D/g, "").length > 0 &&
    candidatos.some((c) => {
      const raw = votos[c.id]?.trim() ?? "";
      if (raw === "") return false;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0;
    });

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
        <Loader2 className="size-4 animate-spin text-teal-700" />
        <span className="font-medium">Carregando candidatos…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
      >
        {loadError}
      </p>
    );
  }

  if (candidatos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-600">
        Nenhum candidato cadastrado para digitação. Cadastre no admin.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
          <ClipboardList className="size-3.5 text-teal-700" />
          Digitar boletim
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <Label htmlFor="manual-zona" className="text-xs text-slate-800">
              Zona *
            </Label>
            <Input
              id="manual-zona"
              inputMode="numeric"
              autoComplete="off"
              value={zona}
              onChange={(e) =>
                setZona(e.target.value.replace(/\D/g, "").slice(0, 3))
              }
              placeholder="001"
              className="h-9 border border-slate-300 text-base font-semibold tabular-nums"
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="manual-secao" className="text-xs text-slate-800">
              Seção *
            </Label>
            <Input
              id="manual-secao"
              inputMode="numeric"
              autoComplete="off"
              value={secao}
              onChange={(e) =>
                setSecao(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0001"
              className="h-9 border border-slate-300 text-base font-semibold tabular-nums"
              required
              disabled={busy}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {grouped.map((group) => (
          <section
            key={group.cargo}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5"
          >
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-teal-800">
              {labelCargoCurto(group.cargo)}
            </h3>
            <ul className="space-y-1">
              {group.items.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                      {c.nome}
                    </p>
                    <p className="text-[10px] leading-tight text-slate-500">
                      Nº {c.numero}
                    </p>
                  </div>
                  <div className="w-20 shrink-0">
                    <Label
                      htmlFor={`voto-${c.id}`}
                      className="sr-only"
                    >{`Votos ${c.nome}`}</Label>
                    <Input
                      id={`voto-${c.id}`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={votos[c.id] ?? ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        setVotos((prev) => ({ ...prev, [c.id]: digits }));
                      }}
                      placeholder="0"
                      className="h-9 border border-slate-300 text-center text-base font-bold tabular-nums"
                      disabled={busy}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-0.5 h-11 w-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
        disabled={busy || !canSubmit}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Revisar e enviar
      </Button>
    </form>
  );
}
