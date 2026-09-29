"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARGOS_FISCAL_ORDEM, CARGOS_OFICIAIS, labelCargoCurto } from "@/lib/cargos";
import type { ConfirmVoteRow, LocalVotacao } from "@/lib/types";
import { formatVotes } from "@/lib/utils";

interface ConfirmTransmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  local: LocalVotacao | null;
  zona: string;
  secao: string;
  rows: ConfirmVoteRow[];
  onConfirm: () => void;
  transmitting: boolean;
  /** Soft notice shown on the confirm surface (not a hard error). */
  notice?: string | null;
}

/**
 * Inline confirmation view (not a portal dialog) so mobile / PWA always
 * shows a clear next step after "Revisar e enviar".
 */
export function ConfirmTransmitModal({
  open,
  onOpenChange,
  local,
  zona,
  secao,
  rows,
  onConfirm,
  transmitting,
  notice,
}: ConfirmTransmitModalProps) {
  if (!open) return null;

  const byCargo = CARGOS_FISCAL_ORDEM.map((cargo) => ({
    cargo,
    items: rows.filter((r) => r.candidato.cargo === cargo),
  })).filter((g) => g.items.length > 0);

  const others = rows.filter(
    (r) => !(CARGOS_OFICIAIS as readonly string[]).includes(r.candidato.cargo)
  );

  function Section({
    title,
    items,
  }: {
    title: string;
    items: ConfirmVoteRow[];
  }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((row) => (
            <li
              key={row.candidato.id}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {row.candidato.nome}
                </p>
                <p className="text-[11px] text-slate-500">
                  Nº {row.candidato.numero}
                </p>
              </div>
              <p className="text-base font-bold tabular-nums text-teal-800">
                {formatVotes(row.quantidade)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      role="region"
      aria-labelledby="confirm-envio-title"
      className="flex flex-col gap-2 rounded-xl border-2 border-teal-600 bg-white px-3 py-3 shadow-sm"
    >
      <div>
        <h2
          id="confirm-envio-title"
          className="text-base font-bold text-slate-900"
        >
          Confirmar envio
        </h2>
        <p className="text-xs text-slate-600">
          Revise zona, seção e votos antes de confirmar.
        </p>
      </div>

      <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
        <p className="text-sm font-semibold text-teal-900">
          Zona {zona} · Seção {secao}
        </p>
        <p className="text-xs text-teal-800/80">
          {local?.nome_escola ?? "Local não cadastrado (envio permitido)"}
          {local?.bairro ? ` · ${local.bairro}` : ""}
        </p>
      </div>

      {notice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {byCargo.map((g) => (
          <Section
            key={g.cargo}
            title={labelCargoCurto(g.cargo)}
            items={g.items}
          />
        ))}
        <Section title="Outros" items={others} />
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Nenhum voto corresponde a candidatos cadastrados.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-slate-300"
          onClick={() => onOpenChange(false)}
          disabled={transmitting}
        >
          Voltar
        </Button>
        <Button
          type="button"
          className="h-11 bg-teal-700 text-white hover:bg-teal-800"
          onClick={onConfirm}
          disabled={transmitting || rows.length === 0}
        >
          {transmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Confirmar envio
        </Button>
      </div>
    </section>
  );
}
