"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBu | null>(null);
  const [local, setLocal] = useState<LocalVotacao | null>(null);
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(null), 3500);
    return () => window.clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!error && !success && !processing) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error, success, processing]);

  const openConfirm = useCallback(
    async (opts: {
      zona: string;
      secao: string;
      votes: Array<{ numero: string; quantidade: number }>;
      rawText: string;
    }) => {
      setError(null);
      setNotice(null);
      setSuccess(null);
      setProcessing(true);
      try {
        const zona = padZona(opts.zona);
        const secao = padSecao(opts.secao);

        if (await urnaJaCadastrada(zona, secao)) {
          setError(DUPLICATE_MSG);
          setConfirmOpen(false);
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
        setNotice(hints.length > 0 ? hints.join(" ") : null);
        setError(null);
      } catch (err) {
        setConfirmOpen(false);
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
        setError(null);
        setSuccess(null);
        setProcessing(true);
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
      if (await urnaJaCadastrada(parsed.zona, parsed.secao)) {
        setError(DUPLICATE_MSG);
        setConfirmOpen(false);
        return;
      }

      const result = await transmitVotes({
        zona: parsed.zona,
        secao: parsed.secao,
        rawText: parsed.rawText,
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
      setSuccess(`Enviado · Zona ${parsed.zona} · Seção ${parsed.secao}`);
      setConfirmOpen(false);
      setParsed(null);
      setLocal(null);
      setRows([]);
      setNotice(null);
      setFormResetKey((k) => k + 1);
      setTab("manual");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao transmitir os votos."
      );
    } finally {
      setTransmitting(false);
    }
  }

  function handleConfirmOpenChange(open: boolean) {
    setConfirmOpen(open);
    if (!open) {
      setNotice(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-4">
      <header className="space-y-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          <Sun className="size-3" />
          Modo fiscal · tela clara
        </div>
        <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-xl">
          Apuração Paralela
        </h1>
        <p className="text-[11px] leading-snug text-slate-600 sm:text-xs">
          Santo André — escaneie o QR ou digite zona, seção e votos.
        </p>
        <p className="text-[10px] text-slate-500">
          Fonte:{" "}
          <span className="font-semibold uppercase">{dataModeLabel()}</span>
        </p>
      </header>

      <div ref={feedbackRef} className="space-y-2">
        {processing && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          >
            <Loader2 className="size-4 animate-spin" />
            <span className="font-semibold">Preparando envio…</span>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-900"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950"
          >
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            {success}
          </p>
        )}
      </div>

      {confirmOpen ? (
        <ConfirmTransmitModal
          open={confirmOpen}
          onOpenChange={handleConfirmOpenChange}
          local={local}
          zona={parsed?.zona ?? ""}
          secao={parsed?.secao ?? ""}
          rows={rows}
          onConfirm={() => void handleConfirm()}
          transmitting={transmitting}
          notice={notice}
        />
      ) : (
        <div className="w-full space-y-2">
          <div
            role="tablist"
            className="grid h-9 w-full grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-0.5"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={tab === "scan"}
              variant="ghost"
              className={cn(
                "h-full rounded-md text-xs font-semibold",
                tab === "scan"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/50"
              )}
              onClick={() => setTab("scan")}
            >
              <QrCode className="size-3.5" />
              Escanear
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={tab === "manual"}
              variant="ghost"
              className={cn(
                "h-full rounded-md text-xs font-semibold",
                tab === "manual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/50"
              )}
              onClick={() => setTab("manual")}
            >
              <ClipboardList className="size-3.5" />
              Digitar
            </Button>
          </div>
          {tab === "scan" ? (
            <BuScanner
              onScan={(text) => void handleRawText(text)}
              busy={processing}
            />
          ) : (
            <ManualBuForm
              onSubmit={(payload) => void handleManual(payload)}
              busy={processing || transmitting}
              resetKey={formResetKey}
            />
          )}
        </div>
      )}
    </div>
  );
}
