"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sun } from "lucide-react";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { FiscalErrorCard, FiscalSuccessCard } from "@/components/fiscal/FiscalFeedback";
import { Button } from "@/components/ui/button";
import {
  dataModeLabel,
  findLocal,
  getConfig,
  resolveBuVotes,
  saveBuPendente,
  transmitBuCompleto,
  urnaJaCadastrada,
  padZona,
  padSecao,
} from "@/lib/data";
import {
  duplicateFeedback,
  feedbackFromError,
  incompleteQrFeedback,
  isNetworkError,
  networkFeedback,
  parseFeedback,
  type FiscalFeedback,
} from "@/lib/fiscal-feedback";
import {
  assertQrSetReadyToIngest,
  describeQrProgress,
  inheritQrZonaSecao,
  isQrSetComplete,
  parseBuQrText,
  peekZonaSecao,
} from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, DiscoveredVote, LocalVotacao, ParsedBu } from "@/lib/types";

export function FiscalApp() {
  const [processing, setProcessing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [feedback, setFeedback] = useState<FiscalFeedback | null>(null);
  const [success, setSuccess] = useState<{ zona: string; secao: string } | null>(
    null
  );
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedBu | null>(null);
  const [local, setLocal] = useState<LocalVotacao | null>(null);
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredVote[]>([]);
  const [fragments, setFragments] = useState<ParsedBu[]>([]);
  const [scanNonce, setScanNonce] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getConfig();
        setWhatsapp(cfg.whatsapp_suporte ?? "");
      } catch {
        setWhatsapp("");
      }
    })();
  }, []);

  useEffect(() => {
    if (!feedback && !success && !processing) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feedback, success, processing]);

  const persistParseFailure = useCallback(async (raw: string, cause: string) => {
    const peek = peekZonaSecao(raw);
    try {
      await saveBuPendente({
        rawText: raw,
        erro: cause,
        zona: peek.zona ?? null,
        secao: peek.secao ?? null,
      });
    } catch {
      /* fila admin é extra — não bloqueia o fiscal */
    }
  }, []);

  const openConfirmFromMerged = useCallback(async (merged: ParsedBu) => {
    setProcessing(true);
    setFeedback(null);
    setSuccess(null);
    try {
      const zona = padZona(merged.zona);
      const secao = padSecao(merged.secao);

      if (await urnaJaCadastrada(zona, secao)) {
        setFeedback(duplicateFeedback(zona, secao));
        setConfirmOpen(false);
        return;
      }

      const resolved = await resolveBuVotes(merged.votes);
      if (resolved.featured.length === 0 && resolved.discovered.length === 0) {
        const cause =
          "QR lido, mas nenhum voto de candidato foi identificado.";
        setFeedback(parseFeedback(cause));
        await persistParseFailure(merged.rawText, cause);
        setConfirmOpen(false);
        return;
      }

      const found = await findLocal(zona, secao);
      setParsed({
        ...merged,
        zona,
        secao,
      });
      setLocal(found);
      setRows(resolved.featured);
      setDiscovered(resolved.discovered);
      setConfirmOpen(true);
    } catch (err) {
      setConfirmOpen(false);
      if (isNetworkError(err)) {
        setFeedback(networkFeedback());
      } else {
        setFeedback(feedbackFromError(err, { zona: merged.zona, secao: merged.secao }));
      }
    } finally {
      setProcessing(false);
    }
  }, [persistParseFailure]);

  const handleRawText = useCallback(
    async (raw: string) => {
      setProcessing(true);
      setFeedback(null);
      setSuccess(null);
      try {
        await new Promise((r) => setTimeout(r, 80));
        let result = parseBuQrText(raw, {
          allowMissingZonaSecao: fragments.length > 0,
        });

        if (fragments.length > 0) {
          const first = fragments[0];
          if (!result.zona || !result.secao) {
            result = inheritQrZonaSecao(result, first);
          } else if (result.zona !== first.zona || result.secao !== first.secao) {
            setFeedback(
              parseFeedback(
                `Este QR é de outra urna (zona ${result.zona} / seção ${result.secao}; a urna atual é zona ${first.zona} / seção ${first.secao}).`
              )
            );
            setScanNonce((n) => n + 1);
            return;
          }
        } else if (!result.zona || !result.secao) {
          setFeedback(
            parseFeedback(
              "Zona ou seção ausente neste QR. Filme o QR que traz zona e seção."
            )
          );
          setScanNonce((n) => n + 1);
          return;
        } else if (await urnaJaCadastrada(result.zona, result.secao)) {
          setFeedback(duplicateFeedback(result.zona, result.secao));
          setScanNonce((n) => n + 1);
          return;
        }

        const nextFragments = (() => {
          if (result.qrIndex) {
            return [
              ...fragments.filter((p) => p.qrIndex !== result.qrIndex),
              result,
            ];
          }
          return [...fragments, result];
        })();

        setFragments(nextFragments);
        setScanNonce((n) => n + 1);

        if (!isQrSetComplete(nextFragments)) {
          const progress = describeQrProgress(nextFragments);
          setFeedback(incompleteQrFeedback(progress.index, progress.total));
          setConfirmOpen(false);
          return;
        }

        const merged = assertQrSetReadyToIngest(nextFragments);
        await openConfirmFromMerged(merged);
      } catch (err) {
        const cause =
          err instanceof Error ? err.message : "Falha ao processar o BU.";
        setFeedback(parseFeedback(cause));
        await persistParseFailure(raw, cause);
        setScanNonce((n) => n + 1);
      } finally {
        setProcessing(false);
      }
    },
    [fragments, openConfirmFromMerged, persistParseFailure]
  );

  function handleCancelFragments() {
    setFragments([]);
    setScanNonce((n) => n + 1);
    setFeedback(null);
    setConfirmOpen(false);
    setParsed(null);
    setRows([]);
    setDiscovered([]);
  }

  async function handleConfirm() {
    if (!parsed) return;
    setTransmitting(true);
    setFeedback(null);
    try {
      if (await urnaJaCadastrada(parsed.zona, parsed.secao)) {
        setFeedback(duplicateFeedback(parsed.zona, parsed.secao));
        setConfirmOpen(false);
        return;
      }

      const result = await transmitBuCompleto({
        zona: parsed.zona,
        secao: parsed.secao,
        rawText: parsed.rawText,
        votes: [
          ...rows.map((r) => ({
            candidatoId: r.candidato.id,
            numero: r.candidato.numero,
            nome: r.candidato.nome,
            cargo: String(r.candidato.cargo),
            quantidade: r.quantidade,
          })),
          ...discovered,
        ],
      });

      if (!result.ok) {
        if (result.duplicate) {
          setFeedback(duplicateFeedback(parsed.zona, parsed.secao));
        } else {
          setFeedback(feedbackFromError(result.message, parsed));
        }
        setConfirmOpen(false);
        return;
      }

      setSuccess({ zona: parsed.zona, secao: parsed.secao });
      setConfirmOpen(false);
      setParsed(null);
      setLocal(null);
      setRows([]);
      setDiscovered([]);
      setFragments([]);
    } catch (err) {
      if (isNetworkError(err)) {
        setFeedback(networkFeedback());
      } else {
        setFeedback(feedbackFromError(err, parsed));
      }
    } finally {
      setTransmitting(false);
    }
  }

  const progress = describeQrProgress(fragments);
  const awaitingMore = fragments.length > 0 && !progress.complete;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-4">
      <header className="space-y-0.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          <Sun className="size-3" />
          Modo fiscal · tela clara
        </div>
        <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
          Apuração Paralela
        </h1>
        <p className="text-sm font-medium leading-snug text-slate-700">
          Santo André. Filme o QR. Verde = enviada.
        </p>
        <p className="text-xs text-slate-500">
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
            <span className="font-semibold">Lendo QR…</span>
          </div>
        )}

        {success ? (
          <FiscalSuccessCard zona={success.zona} secao={success.secao} />
        ) : null}

        {feedback ? (
          <FiscalErrorCard error={feedback} whatsapp={whatsapp} />
        ) : null}
      </div>

      {confirmOpen ? (
        <ConfirmTransmitModal
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open) handleCancelFragments();
          }}
          local={local}
          zona={parsed?.zona ?? ""}
          secao={parsed?.secao ?? ""}
          rows={rows}
          comparecimento={parsed?.comparecimento}
          onConfirm={() => void handleConfirm()}
          onRescan={handleCancelFragments}
          transmitting={transmitting}
          hasMoreVotes={discovered.length > 0}
        />
      ) : (
        <div className="w-full space-y-2">
          {fragments.length > 0 && awaitingMore ? (
            <div
              role="status"
              className="rounded-xl border border-teal-600 bg-teal-50 px-3 py-2.5 text-sm text-teal-950"
            >
              <p className="text-base font-bold">
                QR {progress.index} de {progress.total} — filme o próximo
              </p>
              <p className="mt-1 text-sm font-medium text-teal-800">
                Zona {fragments[0].zona} · Seção {fragments[0].secao}. Os dois
                códigos desta urna.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 border-slate-300"
                onClick={handleCancelFragments}
              >
                Cancelar urna
              </Button>
            </div>
          ) : null}
          <BuScanner
            onScan={(text) => void handleRawText(text)}
            busy={processing || transmitting}
            resetKey={scanNonce}
            nextQr={awaitingMore}
            whatsapp={whatsapp}
          />
        </div>
      )}
    </div>
  );
}
