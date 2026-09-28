"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, QrCode, Sun } from "lucide-react";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { ManualBuForm, type ManualBuSubmit } from "@/components/fiscal/ManualBuForm";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { Button } from "@/components/ui/button";
import {
  dataModeLabel,
  findLocal,
  resolveConfirmRows,
  transmitVotes,
  urnaJaCadastrada,
  padZona,
  padSecao,
} from "@/lib/data";
import { parseBuQrText } from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, LocalVotacao, ParsedBu } from "@/lib/types";
import { cn } from "@/lib/utils";

const DUPLICATE_MSG = "Urna já cadastrada anteriormente";

export function FiscalApp() {
  const [tab, setTab] = useState<"scan" | "manual">("scan");
  const [processing, setProcessing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBu | null>(null);
  const [local, setLocal] = useState<LocalVotacao | null>(null);
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fiscalNome, setFiscalNome] = useState("");

  const openConfirm = useCallback(
    async (opts: {
      zona: string;
      secao: string;
      votes: Array<{ numero: string; quantidade: number }>;
      rawText: string;
    }) => {
      setError(null);
      setSuccess(null);
      setProcessing(true);
      try {
        const zona = padZona(opts.zona);
        const secao = padSecao(opts.secao);

        if (await urnaJaCadastrada(zona, secao)) {
          setError(DUPLICATE_MSG);
          return;
        }

        const found = await findLocal(zona, secao);
        const resolved = await resolveConfirmRows(opts.votes);
        if (resolved.rows.length === 0) {
          throw new Error(
            "Nenhum candidato cadastrado corresponde aos votos informados. Verifique o cadastro no admin."
          );
        }

        setParsed({
          zona,
          secao,
          votes: opts.votes,
          rawText: opts.rawText,
        });
        setLocal(found);
        setRows(resolved.rows);
        setConfirmOpen(true);

        const hints: string[] = [];
        if (!found) {
          hints.push(
            `Local Zona ${zona} / Seção ${secao} ainda não está no cadastro de seções (envio permitido).`
          );
        }
        if (resolved.unknown.length > 0) {
          hints.push(
            `Números sem cadastro ignorados: ${resolved.unknown.join(", ")}`
          );
        }
        setError(hints.length > 0 ? hints.join(" ") : null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Falha ao preparar o envio."
        );
      } finally {
        setProcessing(false);
      }
    },
    []
  );

  const handleRawText = useCallback(
    async (raw: string) => {
      try {
        await new Promise((r) => setTimeout(r, 200));
        const result = parseBuQrText(raw);
        await openConfirm({
          zona: result.zona,
          secao: result.secao,
          votes: result.votes,
          rawText: result.rawText,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao processar o BU.");
        setProcessing(false);
      }
    },
    [openConfirm]
  );

  const handleManual = useCallback(
    async (payload: ManualBuSubmit) => {
      await openConfirm({
        zona: payload.zona,
        secao: payload.secao,
        votes: payload.votes.map((v) => ({
          numero: v.numero,
          quantidade: v.quantidade,
        })),
        rawText: [
          `MANUAL`,
          `ZONA:${payload.zona}`,
          `SECAO:${payload.secao}`,
          ...payload.votes.map(
            (v) => `CAND:${v.numero} QTVO:${v.quantidade}`
          ),
        ].join("\n"),
      });
    },
    [openConfirm]
  );

  async function handleConfirm() {
    if (!parsed) return;
    setTransmitting(true);
    setError(null);
    try {
      // Re-check duplicate right before insert
      if (await urnaJaCadastrada(parsed.zona, parsed.secao)) {
        setError(DUPLICATE_MSG);
        setConfirmOpen(false);
        return;
      }

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
          Santo André — escaneie o QR ou digite zona, seção e votos dos
          candidatos cadastrados.
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
          <span className="font-semibold">Preparando envio…</span>
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
            aria-selected={tab === "manual"}
            variant="ghost"
            className={cn(
              "h-full rounded-lg text-sm font-semibold",
              tab === "manual"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-white/50"
            )}
            onClick={() => setTab("manual")}
          >
            <ClipboardList className="size-4" />
            Digitar
          </Button>
        </div>
        {tab === "scan" ? (
          <BuScanner onScan={(text) => void handleRawText(text)} busy={processing} />
        ) : (
          <ManualBuForm
            onSubmit={(payload) => void handleManual(payload)}
            busy={processing || transmitting}
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
