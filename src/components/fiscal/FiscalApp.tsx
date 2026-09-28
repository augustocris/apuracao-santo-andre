"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, QrCode, Sun } from "lucide-react";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { BuPasteForm } from "@/components/fiscal/BuPasteForm";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { Button } from "@/components/ui/button";
import {
  dataModeLabel,
  findLocal,
  resolveConfirmRows,
  transmitVotes,
} from "@/lib/data";
import { parseBuQrText } from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, LocalVotacao, ParsedBu } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FiscalApp() {
  const [tab, setTab] = useState<"scan" | "paste">("scan");
  const [processing, setProcessing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBu | null>(null);
  const [local, setLocal] = useState<LocalVotacao | null>(null);
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fiscalNome, setFiscalNome] = useState("");

  const handleRawText = useCallback(async (raw: string) => {
    setError(null);
    setSuccess(null);
    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const result = parseBuQrText(raw);
      const found = await findLocal(result.zona, result.secao);
      if (!found) {
        throw new Error(
          `Escola não encontrada para Zona ${result.zona} / Seção ${result.secao}. Verifique o cadastro de locais.`
        );
      }
      const resolved = await resolveConfirmRows(result.votes);
      if (resolved.rows.length === 0) {
        throw new Error(
          "Nenhum candidato cadastrado corresponde aos números do BU."
        );
      }
      setParsed(result);
      setLocal(found);
      setRows(resolved.rows);
      setConfirmOpen(true);
      if (resolved.unknown.length > 0) {
        setError(
          `Números sem cadastro ignorados: ${resolved.unknown.join(", ")}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar o BU.");
    } finally {
      setProcessing(false);
    }
  }, []);

  async function handleConfirm() {
    if (!parsed) return;
    setTransmitting(true);
    setError(null);
    try {
      const result = await transmitVotes({
        zona: parsed.zona,
        secao: parsed.secao,
        rawText: parsed.rawText,
        fiscalNome: fiscalNome.trim() || undefined,
        votes: rows.map((r) => ({
          candidatoId: r.candidato.id,
          quantidade: r.quantidade,
        })),
      });
      if (!result.ok) {
        setError(result.message);
        setConfirmOpen(false);
        return;
      }
      setSuccess(
        `Votos transmitidos: ${local?.nome_escola ?? `Zona ${parsed.zona}`} · Seção ${parsed.secao}`
      );
      setConfirmOpen(false);
      setParsed(null);
      setRows([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao transmitir os votos."
      );
    } finally {
      setTransmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 py-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          <Sun className="size-3.5" />
          Modo fiscal · tela clara
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Apuração Paralela
        </h1>
        <p className="text-sm text-slate-600">
          Santo André — escaneie o QR do Boletim de Urna e transmita os votos.
        </p>
        <p className="text-xs text-slate-500">
          Fonte de dados:{" "}
          <span className="font-semibold uppercase">{dataModeLabel()}</span>
        </p>
      </header>

      {processing && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-teal-900"
        >
          <Loader2 className="size-5 animate-spin" />
          <span className="font-semibold">Processando QR Code...</span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {success}
        </p>
      )}

      <div className="w-full space-y-4">
        <div
          role="tablist"
          className="grid h-12 w-full grid-cols-2 gap-1 rounded-xl bg-slate-200/80 p-1"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "scan"}
            variant="ghost"
            className={cn(
              "h-full rounded-lg text-sm font-semibold",
              tab === "scan"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-white/50"
            )}
            onClick={() => setTab("scan")}
          >
            <QrCode className="size-4" />
            Escanear
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "paste"}
            variant="ghost"
            className={cn(
              "h-full rounded-lg text-sm font-semibold",
              tab === "paste"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-white/50"
            )}
            onClick={() => setTab("paste")}
          >
            Colar Texto do BU
          </Button>
        </div>
        {tab === "scan" ? (
          <BuScanner onScan={(text) => void handleRawText(text)} busy={processing} />
        ) : (
          <BuPasteForm
            onSubmit={(text) => void handleRawText(text)}
            busy={processing}
          />
        )}
      </div>

      <ConfirmTransmitModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        local={local}
        zona={parsed?.zona ?? ""}
        secao={parsed?.secao ?? ""}
        rows={rows}
        fiscalNome={fiscalNome}
        onFiscalNomeChange={setFiscalNome}
        onConfirm={() => void handleConfirm()}
        transmitting={transmitting}
      />
    </div>
  );
}
