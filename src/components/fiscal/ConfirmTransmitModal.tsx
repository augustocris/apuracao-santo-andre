"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelCargoCurto } from "@/lib/cargos";
import type { ConfirmPreview } from "@/lib/fiscal-confirm";
import { formatVotes } from "@/lib/utils";

interface ConfirmTransmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zona: string;
  secao: string;
  preview: ConfirmPreview | null;
  onConfirm: () => void;
  onRescan?: () => void;
  rescanLabel?: string;
  transmitting: boolean;
  canSend: boolean;
}

/**
 * Confirmação curta: zona, seção e um candidato. Sem edição de votos.
 * O envio ainda grava o BU completo no servidor.
 */
export function ConfirmTransmitModal({
  open,
  onOpenChange,
  zona,
  secao,
  preview,
  onConfirm,
  onRescan,
  rescanLabel = "Filmar de novo",
  transmitting,
  canSend,
}: ConfirmTransmitModalProps) {
  if (!open) return null;

  function handleRescan() {
    if (onRescan) onRescan();
    else onOpenChange(false);
  }

  return (
    <section
      role="region"
      aria-labelledby="confirm-envio-title"
      className="flex flex-col gap-3 rounded-xl border-2 border-teal-600 bg-white px-4 py-4 shadow-sm"
    >
      <h2
        id="confirm-envio-title"
        className="text-lg font-bold leading-snug text-slate-900"
      >
        Confirme a zona = {zona}, seção = {secao}
      </h2>

      {preview ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">
            {labelCargoCurto(preview.cargo)}
          </p>
          <p className="mt-0.5 text-base font-bold text-slate-900">
            {preview.nome}
          </p>
          <p className="text-sm text-slate-600">Nº {preview.numero}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-teal-800">
            {formatVotes(preview.quantidade)}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Nenhum candidato com voto neste QR. Filme de novo ou mande foto no
          WhatsApp.
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="h-14 w-full text-lg font-bold bg-teal-700 text-white hover:bg-teal-800"
        onClick={onConfirm}
        disabled={transmitting || !canSend}
      >
        {transmitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Send className="size-5" />
        )}
        Enviar
      </Button>
      {onRescan ? (
        <button
          type="button"
          className="text-center text-sm font-medium text-slate-500 underline underline-offset-2"
          onClick={handleRescan}
          disabled={transmitting}
        >
          {rescanLabel}
        </button>
      ) : null}
    </section>
  );
}
