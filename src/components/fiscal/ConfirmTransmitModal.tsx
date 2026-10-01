"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARGOS_CONFIRM_ORDEM, labelCargoCurto } from "@/lib/cargos";
import type { ConfirmVoteRow, LocalVotacao } from "@/lib/types";
import { formatVotes } from "@/lib/utils";

interface ConfirmTransmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  local: LocalVotacao | null;
  zona: string;
  secao: string;
  rows: ConfirmVoteRow[];
  comparecimento?: number | null;
  onConfirm: () => void;
  onRescan?: () => void;
  transmitting: boolean;
  notice?: string | null;
  /** Full BU has votes even if none of the 5 appeared. */
  hasMoreVotes?: boolean;
}

/**
 * Confirmação curta no celular: zona, seção, comparecimento e os 5 oficiais.
 * Sem edição de votos.
 */
export function ConfirmTransmitModal({
  open,
  onOpenChange,
  local,
  zona,
  secao,
  rows,
  comparecimento,
  onConfirm,
  onRescan,
  transmitting,
  notice,
  hasMoreVotes = false,
}: ConfirmTransmitModalProps) {
  if (!open) return null;

  const confirmCargos = CARGOS_CONFIRM_ORDEM as readonly string[];
  const byCargo = confirmCargos
    .map((cargo) => ({
      cargo,
      items: rows.filter((r) => r.candidato.cargo === cargo),
    }))
    .filter((g) => g.items.length > 0);

  const others = rows.filter((r) => !confirmCargos.includes(r.candidato.cargo));
  const canSend = rows.length > 0 || hasMoreVotes;

  function handleRescan() {
    if (onRescan) onRescan();
    else onOpenChange(false);
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
          Confira zona, seção e os 5 da campanha. Números não se editam aqui.
        </p>
      </div>

      <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
        <p className="text-sm font-semibold text-teal-900">
          Zona {zona} · Seção {secao}
        </p>
        {comparecimento != null ? (
          <p className="text-xs font-medium text-teal-900">
            Comparecimento: {formatVotes(comparecimento)}
          </p>
        ) : null}
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
          <div key={g.cargo} className="space-y-1">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {labelCargoCurto(g.cargo)}
            </h3>
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {g.items.map((row) => (
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
        ))}
        {others.length > 0 ? (
          <div className="space-y-1">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Outros oficiais
            </h3>
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {others.map((row) => (
                <li
                  key={row.candidato.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5"
                >
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {row.candidato.nome}
                  </p>
                  <p className="text-base font-bold tabular-nums text-teal-800">
                    {formatVotes(row.quantidade)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {hasMoreVotes
            ? "Nenhum dos 5 da campanha neste QR. O BU completo ainda pode ser gravado."
            : "Nenhum dos 5 da campanha apareceu neste BU. Leia de novo ou mande foto no WhatsApp da central."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-slate-300"
          onClick={handleRescan}
          disabled={transmitting}
        >
          Ler de novo
        </Button>
        <Button
          type="button"
          className="h-11 bg-teal-700 text-white hover:bg-teal-800"
          onClick={onConfirm}
          disabled={transmitting || !canSend}
        >
          {transmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Confirmar
        </Button>
      </div>
    </section>
  );
}
