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
      // Senadores (and any ties): registration / número order
      return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    });
}

export function ManualBuForm({ onSubmit, busy }: ManualBuFormProps) {
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
      <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-6 text-slate-700">
        <Loader2 className="size-5 animate-spin text-teal-700" />
        <span className="font-medium">Carregando candidatos…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <p
        role="alert"
        className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
      >
        {loadError}
      </p>
    );
  }

  if (candidatos.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
        Nenhum candidato cadastrado. Peça ao admin para cadastrar na aba
        Cadastro do telão.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          <ClipboardList className="size-4 text-teal-700" />
          Digitar boletim
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-zona" className="text-slate-800">
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
              className="h-12 border-2 border-slate-300 text-lg font-semibold tabular-nums"
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-secao" className="text-slate-800">
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
              className="h-12 border-2 border-slate-300 text-lg font-semibold tabular-nums"
              required
              disabled={busy}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map((group) => (
          <section
            key={group.cargo}
            className="space-y-2 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
          >
            <h3 className="text-xs font-bold uppercase tracking-wide text-teal-800">
              {labelCargoCurto(group.cargo)}
            </h3>
            <ul className="space-y-3">
              {group.items.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {c.nome}
                    </p>
                    <p className="text-xs text-slate-500">Nº {c.numero}</p>
                  </div>
                  <div className="w-28 shrink-0 space-y-1">
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
                      className="h-12 border-2 border-slate-300 text-center text-lg font-bold tabular-nums"
                      disabled={busy}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Preencha ao menos um campo de votos. Em seguida revise e envie.
      </p>

      <Button
        type="submit"
        size="lg"
        className="h-14 w-full bg-teal-700 text-base font-semibold text-white hover:bg-teal-800"
        disabled={busy || !canSubmit}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Send className="size-5" />
        )}
        Revisar e enviar
      </Button>
    </form>
  );
}
