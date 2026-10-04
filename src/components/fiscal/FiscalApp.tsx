"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { BuScanner } from "@/components/fiscal/BuScanner";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { FiscalErrorCard, FiscalSuccessCard } from "@/components/fiscal/FiscalFeedback";
import { ZonaConfirmPanel } from "@/components/fiscal/ZonaConfirmPanel";
import { Button } from "@/components/ui/button";
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
  leftoverUrnaFeedback,
  parseFeedback,
  qrReadFeedback,
  qrMismatchFeedback,
  SUCCESS_CLEAR_MS,
  unreadWhatsappPhotosFeedback,
  heldContinuationFeedback,
  heldPartFeedback,
  qr1HeldNoZonaFeedback,
  waitingNextQrLabel,
  wrongBuFeedback,
  zonaForaFeedback,
  type FiscalFeedback,
} from "@/lib/fiscal-feedback";
import {
  assertQrSetReadyToIngest,
  backfillQrSet,
  BuParseError,
  describeQrProgress,
  isContinuationSequence,
  isQrSetComplete,
  nextMissingQrIndex,
  parseBuQrText,
  parseFiscalQrChunk,
  describeQrPayloadKeys,
  parseQrbuMeta,
  peekZonaSecao,
  IgnoreNonBuFrameError,
  looksLikeTseBuQr,
  SameQrRepeatError,
  SAMPLE_TSE_QR_TEXT,
  sameQrPayload,
  WrongBuError,
} from "@/lib/parser/bu-qr";
import {
  assembleWhatsappPhotos,
  leftoverUrnaSummary,
} from "@/lib/parser/whatsapp-photos";
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
  const [leftover, setLeftover] = useState<ParsedBu[]>([]);
  const [scanNonce, setScanNonce] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [needZonaPick, setNeedZonaPick] = useState(false);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const fragmentsRef = useRef<ParsedBu[]>([]);
  fragmentsRef.current = fragments;
  const leftoverRef = useRef<ParsedBu[]>([]);
  leftoverRef.current = leftover;
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
      const held = leftoverRef.current;
      leftoverRef.current = [];
      setLeftover([]);
      fragmentsRef.current = held;
      writeQrSession(held);
      setFragments(held);
      setScanNonce((n) => n + 1);
      if (held.length > 0) {
        const progress = describeQrProgress(held);
        const missing = nextMissingQrIndex(held);
        setFeedback(
          missing === 1
            ? heldContinuationFeedback(progress.index, progress.total)
            : qrReadFeedback(progress.index, progress.total)
        );
      } else {
        setFeedback(null);
      }
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
      if (!merged.zona || !merged.secao) {
        setNeedZonaPick(true);
        setParsed(merged);
        setConfirmOpen(false);
        setFeedback(qr1HeldNoZonaFeedback(merged.qrIndex ?? 1, merged.qrTotal ?? 2));
        await persistParseFailure(
          merged.rawText,
          `QR1 sem zona. ${describeQrPayloadKeys(merged.rawText)}`
        );
        return;
      }

      const zona = padZona(merged.zona);
      const secao = padSecao(merged.secao);

      if (isZonaForaDaCidade(zona, zonasConfigRef.current)) {
        setFeedback(zonaForaFeedback(zona));
        setConfirmOpen(false);
        return;
      }

      if (await urnaJaCadastrada(zona, secao, merged.urnaId)) {
        setFeedback(duplicateFeedback(zona, secao, merged.urnaId));
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

  const applyAssembledParts = useCallback(
    async (nextFragments: ParsedBu[], leftoverParts: ParsedBu[]) => {
      leftoverRef.current = leftoverParts;
      setLeftover(leftoverParts);

      const donor = nextFragments.find((p) => p.zona && p.secao);
      if (donor && isZonaForaDaCidade(donor.zona, zonasConfigRef.current)) {
        setFeedback(zonaForaFeedback(padZona(donor.zona)));
        fragmentsRef.current = [];
        writeQrSession([]);
        setFragments([]);
        setScanNonce((n) => n + 1);
        return;
      }

      if (
        donor?.zona &&
        donor.secao &&
        (await urnaJaCadastrada(donor.zona, donor.secao, donor.urnaId))
      ) {
        setFeedback(duplicateFeedback(donor.zona, donor.secao, donor.urnaId));
        setScanNonce((n) => n + 1);
        return;
      }

      fragmentsRef.current = nextFragments;
      writeQrSession(nextFragments);
      setFragments(nextFragments);
      setScanNonce((n) => n + 1);

      const leftoverInfo =
        leftoverParts.length > 0 ? leftoverUrnaSummary(leftoverParts) : null;

        if (!isQrSetComplete(nextFragments)) {
          const missing = nextMissingQrIndex(nextFragments);
          const progress = describeQrProgress(nextFragments);
          const noZona = !nextFragments.some((p) => p.zona);
          setFeedback(
            leftoverInfo
              ? leftoverUrnaFeedback(leftoverInfo.urnaId, leftoverInfo.qrLabel)
              : missing === 1
                ? heldContinuationFeedback(progress.index, progress.total)
                : noZona
                  ? qr1HeldNoZonaFeedback(progress.index, progress.total)
                  : heldPartFeedback(progress.index, progress.total)
          );
          setConfirmOpen(false);
          return;
        }

      const merged = assertQrSetReadyToIngest(nextFragments);
      await openConfirmFromMerged(merged);
    },
    [openConfirmFromMerged]
  );

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
      if (!looksLikeTseBuQr(raw)) {
        setScanNonce((n) => n + 1);
        return;
      }
      setProcessing(true);
      setSuccess(null);
      try {
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

        if (
          previous.length === 0 &&
          result.zona &&
          result.secao &&
          (await urnaJaCadastrada(result.zona, result.secao, result.urnaId))
        ) {
          setFeedback(duplicateFeedback(result.zona, result.secao, result.urnaId));
          setScanNonce((n) => n + 1);
          return;
        }

        const nextFragments = backfillQrSet((() => {
          if (result.qrIndex) {
            return [
              ...previous.filter((p) => p.qrIndex !== result.qrIndex),
              result,
            ];
          }
          return [...previous, result];
        })());
        fragmentsRef.current = nextFragments;
        writeQrSession(nextFragments);

        setFragments(nextFragments);
        setScanNonce((n) => n + 1);

        if (!isQrSetComplete(nextFragments)) {
          const missing = nextMissingQrIndex(nextFragments);
          const progress = describeQrProgress(nextFragments);
          const noZona = !result.zona && !nextFragments.some((p) => p.zona);
          if (noZona) {
            void persistParseFailure(
              raw,
              `QR sem zona. ${describeQrPayloadKeys(raw)}`
            );
          }
          setFeedback(
            missing === 1
              ? heldContinuationFeedback(
                  result.qrIndex ?? progress.index,
                  result.qrTotal ?? progress.total
                )
              : noZona
                ? qr1HeldNoZonaFeedback(
                    result.qrIndex ?? progress.index,
                    result.qrTotal ?? progress.total
                  )
                : heldPartFeedback(
                    result.qrIndex ?? progress.index,
                    result.qrTotal ?? progress.total
                  )
          );
          setConfirmOpen(false);
          return;
        }

        const merged = assertQrSetReadyToIngest(nextFragments);
        await openConfirmFromMerged(merged);
      } catch (err) {
        if (
          err instanceof SameQrRepeatError ||
          err instanceof IgnoreNonBuFrameError
        ) {
          setScanNonce((n) => n + 1);
          return;
        }
        const debug =
          err instanceof BuParseError ? err.debug : undefined;
        const cause =
          err instanceof Error ? err.message : "Falha ao processar o BU.";
        const meta = parseQrbuMeta(raw);
        if (/Nenhum voto de candidato encontrado no QR/i.test(cause)) {
          try {
            const held = parseFiscalQrChunk(raw, fragmentsRef.current);
            const previous = fragmentsRef.current;
            const nextFragments = backfillQrSet(
              held.qrIndex
                ? [...previous.filter((p) => p.qrIndex !== held.qrIndex), held]
                : [...previous, held]
            );
            fragmentsRef.current = nextFragments;
            writeQrSession(nextFragments);
            setFragments(nextFragments);
            const progress = describeQrProgress(nextFragments);
            setFeedback(
              heldPartFeedback(
                held.qrIndex ?? progress.index,
                held.qrTotal ?? progress.total
              )
            );
          } catch {
            setFeedback(
              heldPartFeedback(meta?.index ?? 1, Math.max(meta?.total ?? 2, 2))
            );
          }
          setScanNonce((n) => n + 1);
          return;
        }
        if (
          /Zona não encontrada|Zona não veio|Zona ou seção ausente|Zona\/seção ausentes|Formatos aceitos:\s*ZONA/i.test(
            cause
          )
        ) {
          // Never flash red “QR não entrou” — hold the chunk and ask for the rest.
          try {
            const held = parseFiscalQrChunk(raw, fragmentsRef.current);
            const previous = fragmentsRef.current;
            const nextFragments = backfillQrSet(
              held.qrIndex
                ? [...previous.filter((p) => p.qrIndex !== held.qrIndex), held]
                : [...previous, held]
            );
            fragmentsRef.current = nextFragments;
            writeQrSession(nextFragments);
            setFragments(nextFragments);
            const progress = describeQrProgress(nextFragments);
            const missing = nextMissingQrIndex(nextFragments);
            const noZona = !nextFragments.some((p) => p.zona);
            setFeedback(
              missing === 1
                ? heldContinuationFeedback(
                    held.qrIndex ?? progress.index,
                    held.qrTotal ?? progress.total
                  )
                : noZona
                  ? qr1HeldNoZonaFeedback(
                      held.qrIndex ?? progress.index,
                      held.qrTotal ?? progress.total
                    )
                  : heldPartFeedback(
                      held.qrIndex ?? progress.index,
                      held.qrTotal ?? progress.total
                    )
            );
          } catch {
            void persistParseFailure(raw, describeQrPayloadKeys(raw));
            setFeedback(
              isContinuationSequence(meta)
                ? heldContinuationFeedback(meta?.index ?? 2, meta?.total ?? 2)
                : qr1HeldNoZonaFeedback(
                    meta?.index ?? 1,
                    Math.max(meta?.total ?? 2, 2)
                  )
            );
          }
          setScanNonce((n) => n + 1);
          return;
        }
        if (
          fragmentsRef.current.length === 0 &&
          (isContinuationSequence(meta) ||
            /Filme o QR de cima|1º/i.test(cause)) &&
          !(err instanceof WrongBuError)
        ) {
          setFeedback(
            isContinuationSequence(meta)
              ? heldContinuationFeedback(meta?.index ?? 2, meta?.total ?? 2)
              : qr1HeldNoZonaFeedback(meta?.index ?? 1, meta?.total ?? 2)
          );
          setScanNonce((n) => n + 1);
          return;
        }
        setFeedback(
          err instanceof WrongBuError || /outra urna/i.test(cause)
            ? wrongBuFeedback(debug ?? "")
            : /não combina/i.test(cause)
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

  const handlePhotoBatch = useCallback(
    async (texts: string[]) => {
      setProcessing(true);
      setSuccess(null);
      try {
        const batch = assembleWhatsappPhotos(texts, fragmentsRef.current);
        if (batch.read === 0) {
          setFeedback(
            unreadWhatsappPhotosFeedback(batch.failed || texts.length || 1)
          );
          return;
        }
        const progress = describeQrProgress(batch.primary);
        setFeedback(
          qrReadFeedback(
            batch.primary.find((p) => p.qrIndex)?.qrIndex ?? progress.index,
            progress.total
          )
        );
        await applyAssembledParts(batch.primary, batch.leftover);
      } catch (err) {
        const cause =
          err instanceof Error ? err.message : "Falha ao ler as fotos do WhatsApp.";
        setFeedback(parseFeedback(cause));
        const joined = texts.filter((t) => t.trim()).join("\n---\n");
        if (joined) await persistParseFailure(joined, cause);
      } finally {
        setProcessing(false);
      }
    },
    [applyAssembledParts, persistParseFailure]
  );

  function handleCancelFragments() {
    fragmentsRef.current = [];
    writeQrSession([]);
    setFragments([]);
    setScanNonce((n) => n + 1);
    setFeedback(
      leftoverRef.current.length > 0
        ? leftoverUrnaFeedback(
            leftoverUrnaSummary(leftoverRef.current).urnaId,
            leftoverUrnaSummary(leftoverRef.current).qrLabel
          )
        : null
    );
    setNeedZonaPick(false);
    setConfirmOpen(false);
    setParsed(null);
    setRows([]);
    setDiscovered([]);
  }

  function handleManualZona(zona: string, secao: string) {
    const z = padZona(zona);
    const s = padSecao(secao);
    if (isZonaForaDaCidade(z, zonasConfigRef.current)) {
      setFeedback(zonaForaFeedback(z));
      return;
    }
    const next = fragmentsRef.current.map((part) => ({
      ...part,
      zona: part.zona || z,
      secao: part.secao || s,
    }));
    fragmentsRef.current = next;
    writeQrSession(next);
    setFragments(next);
    setNeedZonaPick(false);
    const merged = {
      ...assertQrSetReadyToIngest(next),
      zona: z,
      secao: s,
    };
    void openConfirmFromMerged(merged);
  }

  function handleStartLeftoverBu() {
    const held = leftoverRef.current;
    leftoverRef.current = [];
    setLeftover([]);
    fragmentsRef.current = [];
    writeQrSession([]);
    setFragments([]);
    void (async () => {
      setProcessing(true);
      try {
        await applyAssembledParts(held, []);
      } finally {
        setProcessing(false);
      }
    })();
  }

  async function handleConfirm() {
    if (!parsed) return;
    setTransmitting(true);
    setFeedback(null);
    try {
      if (await urnaJaCadastrada(parsed.zona, parsed.secao, parsed.urnaId)) {
        setFeedback(duplicateFeedback(parsed.zona, parsed.secao, parsed.urnaId));
        setConfirmOpen(false);
        return;
      }

      const result = await transmitBuCompleto({
        zona: parsed.zona,
        secao: parsed.secao,
        urnaId: parsed.urnaId ?? null,
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
          setFeedback(duplicateFeedback(parsed.zona, parsed.secao, parsed.urnaId));
        } else {
          setFeedback(feedbackFromError(result.message, parsed));
        }
        setConfirmOpen(false);
        return;
      }

      setSuccess({ zona: parsed.zona, secao: parsed.secao });
      setNeedZonaPick(false);
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
  const showIdleLine = !success && !confirmOpen && !needZonaPick && !awaitingMore;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 px-3 py-4 sm:px-4">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
          Apuração Santo André
        </h1>
        {showIdleLine ? (
          <p className="text-lg font-bold leading-snug text-teal-900">
            Clique abaixo e filme o QRCODE da BU. Com 2 QRs, filme os dois — ou
            use Fotos do WhatsApp.
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

      {success ? null : needZonaPick ? (
        <ZonaConfirmPanel
          zonas={zonasConfig}
          secao={parsed?.secao ?? fragments.find((p) => p.secao)?.secao ?? ""}
          onConfirm={handleManualZona}
          onCancel={handleCancelFragments}
        />
      ) : confirmOpen ? (
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
          (!feedback ||
            feedback.kind === "incomplete_qr" ||
            feedback.title === "Sobrou outra urna") ? (
            <p
              role="status"
              className="text-base font-bold leading-snug text-teal-900"
            >
              {waitingNextQrLabel(
                fragments[0].zona,
                fragments[0].secao,
                nextMissingQrIndex(fragments)
              )}
            </p>
          ) : null}
          {leftover.length > 0 && !confirmOpen ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-2 border-amber-500 text-base font-bold text-amber-950"
              onClick={handleStartLeftoverBu}
              disabled={processing || transmitting}
            >
              Começar a outra BU
            </Button>
          ) : null}
          <BuScanner
            onScan={(text) => void handleRawText(text)}
            onPhotosDecoded={(texts) => void handlePhotoBatch(texts)}
            busy={processing || transmitting}
            resetKey={scanNonce}
            nextQr={awaitingMore}
            keepOpen
            ignoreExactPayloads={fragments.map((part) => part.rawText)}
            whatsapp={whatsapp}
          />
        </div>
      )}
    </div>
  );
}
