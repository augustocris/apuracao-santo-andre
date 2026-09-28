"use client";

import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARGOS_FISCAL_ORDEM, CARGOS_OFICIAIS } from "@/lib/cargos";
import type { ConfirmVoteRow, LocalVotacao } from "@/lib/types";
import { formatVotes } from "@/lib/utils";

interface ConfirmTransmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  local: LocalVotacao | null;
  zona: string;
  secao: string;
  rows: ConfirmVoteRow[];
  fiscalNome: string;
  onFiscalNomeChange: (value: string) => void;
  onConfirm: () => void;
  transmitting: boolean;
}

export function ConfirmTransmitModal({
  open,
  onOpenChange,
  local,
  zona,
  secao,
  rows,
  fiscalNome,
  onFiscalNomeChange,
  onConfirm,
  transmitting,
}: ConfirmTransmitModalProps) {
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
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
          {items.map((row) => (
            <li
              key={row.candidato.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {row.candidato.nome}
                </p>
                <p className="text-xs text-slate-500">
                  Nº {row.candidato.numero}
                </p>
              </div>
              <p className="text-lg font-bold tabular-nums text-teal-800">
                {formatVotes(row.quantidade)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar boletim</DialogTitle>
          <DialogDescription>
            Revise zona, seção e votos dos candidatos cadastrados antes de
            enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
            <p className="text-sm font-medium text-teal-900">
              Zona {zona} · Seção {secao}
            </p>
            <p className="text-xs text-teal-800/80">
              {local?.nome_escola ?? "Local não cadastrado (envio permitido)"}
              {local?.bairro ? ` · ${local.bairro}` : ""}
            </p>
          </div>

          {byCargo.map((g) => (
            <Section key={g.cargo} title={g.cargo} items={g.items} />
          ))}
          <Section title="Outros" items={others} />

          {rows.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Nenhum voto corresponde a candidatos cadastrados.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="fiscal-nome">Nome do fiscal (opcional)</Label>
            <Input
              id="fiscal-nome"
              value={fiscalNome}
              onChange={(e) => onFiscalNomeChange(e.target.value)}
              placeholder="Seu nome"
              disabled={transmitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-teal-700 text-white hover:bg-teal-800"
            onClick={onConfirm}
            disabled={transmitting || rows.length === 0}
          >
            {transmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
