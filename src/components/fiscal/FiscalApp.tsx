"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, QrCode, Sun } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { BuPasteForm } from "@/components/fiscal/BuPasteForm";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import {
  dataModeLabel,
  findLocal,
  resolveConfirmRows,
  transmitVotes,
} from "@/lib/data";
import { parseBuQrText } from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, LocalVotacao, ParsedBu } from "@/lib/types";

export function FiscalApp() {
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

      <Tabs defaultValue="scan" className="w-full">
        <TabsList className="grid h-12 w-full grid-cols-2 bg-slate-200/80">
          <TabsTrigger value="scan" className="text-sm font-semibold">
            <QrCode className="size-4" />
            Escanear
          </TabsTrigger>
          <TabsTrigger value="paste" className="text-sm font-semibold">
            Colar Texto do BU
          </TabsTrigger>
        </TabsList>
        <TabsContent value="scan" className="mt-4">
          <BuScanner onScan={(text) => void handleRawText(text)} busy={processing} />
        </TabsContent>
        <TabsContent value="paste" className="mt-4">
          <BuPasteForm
            onSubmit={(text) => void handleRawText(text)}
            busy={processing}
          />
        </TabsContent>
      </Tabs>

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
