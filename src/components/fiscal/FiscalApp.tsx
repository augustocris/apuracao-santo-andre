"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { FiscalErrorCard, FiscalSuccessCard } from "@/components/fiscal/FiscalFeedback";
import {
  getConfig,
  resolveBuVotes,
  saveBuPendente,
  transmitBuCompleto,
  urnaJaCadastrada,
  padZona,
  padSecao,
} from "@/lib/data";
import { pickConfirmPreview } from "@/lib/fiscal-confirm";
import {
  duplicateFeedback,
  feedbackFromError,
  isNetworkError,
  networkFeedback,
  parseFeedback,
  qrMismatchFeedback,
  SUCCESS_CLEAR_MS,
  waitingSecondQrLabel,
  zonaForaFeedback,
  type FiscalFeedback,
} from "@/lib/fiscal-feedback";
import {
  assertQrSetReadyToIngest,
  BuParseError,
  describeQrProgress,
  isQrSetComplete,
  parseBuQrText,
  parseFiscalQrChunk,
  peekZonaSecao,
  SameQrRepeatError,
  SAMPLE_TSE_QR_TEXT,
  sameQrPayload,
} from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, DiscoveredVote, ParsedBu, ZonaConfigRow } from "@/lib/types";
import { isZonaForaDaCidade } from "@/lib/zona-allowlist";

const QR_SESSION_KEY = "apuracao-fiscal-qr-parts";

function readQrSession(): ParsedBu[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(QR_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ParsedBu[]) : [];
  } catch {
    return [];
  }
}

function writeQrSession(parts: ParsedBu[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (parts.length === 0) sessionStorage.removeItem(QR_SESSION_KEY);
    else sessionStorage.setItem(QR_SESSION_KEY, JSON.stringify(parts));
  } catch {
    /* ignore quota */
  }
}

export function FiscalApp() {
  const [processing, setProcessing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [feedback, setFeedback] = useState<FiscalFeedback | null>(null);
  const [success, setSuccess] = useState<{ zona: string; secao: string } | null>(
    null
  );
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [zonasConfig, setZonasConfig] = useState<ZonaConfigRow[]>([]);
  const [parsed, setParsed] = useState<ParsedBu | null>(null);
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredVote[]>([]);
  const [fragments, setFragments] = useState<ParsedBu[]>([]);
  const [scanNonce, setScanNonce] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const fragmentsRef = useRef<ParsedBu[]>([]);
  fragmentsRef.current = fragments;
  const zonasConfigRef = useRef<ZonaConfigRow[]>([]);
  zonasConfigRef.current = zonasConfig;

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getConfig();
        setWhatsapp(cfg.whatsapp_suporte ?? "");
        setZonasConfig(cfg.zonas_config ?? []);
        zonasConfigRef.current = cfg.zonas_config ?? [];
        const saved = readQrSession();
        if (saved.length > 0) {
          const zona = saved.find((p) => p.zona)?.zona;
          if (zona && isZonaForaDaCidade(zona, cfg.zonas_config)) {
            fragmentsRef.current = [];
            writeQrSession([]);
            setFragments([]);
          } else {
            fragmentsRef.current = saved;
            setFragments(saved);
          }
        }
      } catch {
        setWhatsapp("");
        const saved = readQrSession();
        if (saved.length > 0) {
          fragmentsRef.current = saved;
          setFragments(saved);
        }
      }
    })();
  }, []);

  useEffect(() => {
    writeQrSession(fragments);
    fragmentsRef.current = fragments;
  }, [fragments]);

  useEffect(() => {
    if (!feedback && !success && !processing) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feedback, success, processing]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess(null);
      fragmentsRef.current = [];
      writeQrSession([]);
      setFragments([]);
      setScanNonce((n) => n + 1);
      setFeedback(null);
      setConfirmOpen(false);
      setParsed(null);
      setRows([]);
      setDiscovered([]);
    }, SUCCESS_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [success]);

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

      if (isZonaForaDaCidade(zona, zonasConfigRef.current)) {
        setFeedback(zonaForaFeedback(zona));
        setConfirmOpen(false);
        return;
      }

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

      setParsed({
        ...merged,
        zona,
        secao,
      });
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

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    const ui = new URLSearchParams(window.location.search).get("ui");
    if (ui === "success") {
      setSuccess({ zona: "247", secao: "0123" });
      return;
    }
    if (ui !== "confirm") return;
    void (async () => {
      try {
        await openConfirmFromMerged(parseBuQrText(SAMPLE_TSE_QR_TEXT));
      } catch {
        /* preview local — não bloqueia o fiscal */
      }
    })();
  }, [openConfirmFromMerged]);

  const handleRawText = useCallback(
    async (raw: string) => {
      setProcessing(true);
      setFeedback(null);
      setSuccess(null);
      try {
        await new Promise((r) => setTimeout(r, 80));
        const previous = fragmentsRef.current;
        if (previous.some((part) => sameQrPayload(part.rawText, raw))) {
          setScanNonce((n) => n + 1);
          return;
        }
        const result = parseFiscalQrChunk(raw, previous);

        if (isZonaForaDaCidade(result.zona, zonasConfigRef.current)) {
          setFeedback(zonaForaFeedback(padZona(result.zona)));
          fragmentsRef.current = [];
          writeQrSession([]);
          setFragments([]);
          setScanNonce((n) => n + 1);
          return;
        }

        if (previous.length === 0 && (await urnaJaCadastrada(result.zona, result.secao))) {
          setFeedback(duplicateFeedback(result.zona, result.secao));
          setScanNonce((n) => n + 1);
          return;
        }

        const nextFragments = (() => {
          if (result.qrIndex) {
            return [
              ...previous.filter((p) => p.qrIndex !== result.qrIndex),
              result,
            ];
          }
          return [...previous, result];
        })();
        fragmentsRef.current = nextFragments;
        writeQrSession(nextFragments);

        setFragments(nextFragments);
        setScanNonce((n) => n + 1);

        if (!isQrSetComplete(nextFragments)) {
          setFeedback(null);
          setConfirmOpen(false);
          return;
        }

        const merged = assertQrSetReadyToIngest(nextFragments);
        await openConfirmFromMerged(merged);
      } catch (err) {
        if (err instanceof SameQrRepeatError) {
          setScanNonce((n) => n + 1);
          return;
        }
        const debug =
          err instanceof BuParseError ? err.debug : undefined;
        const cause =
          err instanceof Error ? err.message : "Falha ao processar o BU.";
        setFeedback(
          /outra urna|não combina/i.test(cause)
            ? qrMismatchFeedback(debug ?? "")
            : parseFeedback(cause, debug)
        );
        await persistParseFailure(raw, debug ? `${cause} ${debug}` : cause);
        setScanNonce((n) => n + 1);
      } finally {
        setProcessing(false);
      }
    },
    [openConfirmFromMerged, persistParseFailure]
  );

  function handleCancelFragments() {
    fragmentsRef.current = [];
    writeQrSession([]);
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
      setRows([]);
      setDiscovered([]);
      fragmentsRef.current = [];
      writeQrSession([]);
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
  const preview = pickConfirmPreview(rows, discovered);
  const showIdleLine = !success && !confirmOpen && !awaitingMore;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 px-3 py-4 sm:px-4">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
          Apuração Santo André
        </h1>
        {showIdleLine ? (
          <p className="text-lg font-bold leading-snug text-teal-900">
            Clique abaixo e Filme o QRCODE da BU.
          </p>
        ) : null}
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

        {!success && feedback ? (
          <FiscalErrorCard error={feedback} whatsapp={whatsapp} />
        ) : null}
      </div>

      {success ? null : confirmOpen ? (
        <ConfirmTransmitModal
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open) handleCancelFragments();
          }}
          zona={parsed?.zona ?? ""}
          secao={parsed?.secao ?? ""}
          preview={preview}
          onConfirm={() => void handleConfirm()}
          onRescan={handleCancelFragments}
          transmitting={transmitting}
          canSend={rows.length > 0 || discovered.length > 0}
        />
      ) : (
        <div className="w-full space-y-3">
          {fragments.length > 0 &&
          awaitingMore &&
          (!feedback || feedback.kind === "incomplete_qr") ? (
            <p
              role="status"
              className="text-base font-bold leading-snug text-teal-900"
            >
              {waitingSecondQrLabel(fragments[0].zona, fragments[0].secao)}
            </p>
          ) : null}
          <BuScanner
            onScan={(text) => void handleRawText(text)}
            busy={processing || transmitting}
            resetKey={scanNonce}
            nextQr={awaitingMore}
            ignoreExactPayloads={fragments.map((part) => part.rawText)}
            whatsapp={whatsapp}
          />
        </div>
      )}
    </div>
  );
}
