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
  resolveBuVotes,
  resolveConfirmRows,
  transmitBuCompleto,
  transmitVotes,
  urnaJaCadastrada,
  padZona,
  padSecao,
} from "@/lib/data";
import { parseBuQrText, mergeParsedBus, SAMPLE_BU_TEXT, SAMPLE_TSE_QR_PART1, SAMPLE_TSE_QR_PART2 } from "@/lib/parser/bu-qr";
import type { ConfirmVoteRow, DiscoveredVote, LocalVotacao, ParsedBu } from "@/lib/types";
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
  const [discovered, setDiscovered] = useState<DiscoveredVote[]>([]);
  const [ingestMode, setIngestMode] = useState<"full" | "featured">("full");
  const [fragments, setFragments] = useState<ParsedBu[]>([]);
  const [scanNonce, setScanNonce] = useState(0);
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
      votes: Array<{
        numero: string;
        quantidade: number;
        nome?: string;
        cargo?: string;
      }>;
      rawText: string;
      mode: "full" | "featured";
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
        setIngestMode(opts.mode);

        if (opts.mode === "full") {
          const resolved = await resolveBuVotes(opts.votes);
          if (resolved.featured.length === 0 && resolved.discovered.length === 0) {
            throw new Error(
              "QR lido, mas nenhum voto de candidato foi identificado. Tente a foto do QR ou a aba Digitar."
            );
          }
          setParsed({
            zona,
            secao,
            votes: opts.votes.map((v) => ({
              numero: v.numero,
              quantidade: v.quantidade,
              nome: v.nome ?? `Candidato ${v.numero}`,
              cargo: v.cargo ?? "Outro",
            })),
            rawText: opts.rawText,
          });
          setLocal(found);
          setRows(resolved.featured);
          setDiscovered(resolved.discovered);
          setConfirmOpen(true);
          const hints: string[] = [];
          if (!found) {
            hints.push(
              `Local Zona ${zona} / Seção ${secao} ainda não está no cadastro de seções (envio permitido).`
            );
          }
          if (resolved.discovered.length > 0) {
            hints.push(
              `${resolved.discovered.length} candidato(s) além dos oficiais serão gravados no ranking geral.`
            );
          }
          setNotice(hints.length > 0 ? hints.join(" ") : null);
          setError(null);
          return;
        }

        const resolved = await resolveConfirmRows(opts.votes);
        if (resolved.rows.length === 0) {
          throw new Error(
            `Formulário lido, mas nenhum número cadastrado corresponde aos votos. Verifique o cadastro no admin.`
          );
        }

        setParsed({
          zona,
          secao,
          votes: opts.votes.map((v) => ({
            numero: v.numero,
            quantidade: v.quantidade,
            nome: v.nome ?? `Candidato ${v.numero}`,
            cargo: v.cargo ?? "Outro",
          })),
          rawText: opts.rawText,
        });
        setLocal(found);
        setRows(resolved.rows);
        setDiscovered([]);
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
        await new Promise((r) => setTimeout(r, 150));
        const result = parseBuQrText(raw);

        if (fragments.length > 0) {
          const first = fragments[0];
          if (result.zona !== first.zona || result.secao !== first.secao) {
            throw new Error(
              `Este QR é de outra urna (zona ${result.zona} / seção ${result.secao}; a urna atual é zona ${first.zona} / seção ${first.secao}).`
            );
          }
        } else if (await urnaJaCadastrada(result.zona, result.secao)) {
          setError(DUPLICATE_MSG);
          setProcessing(false);
          return;
        }

        setFragments((prev) => [...prev, result]);
        setScanNonce((n) => n + 1);
        setProcessing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao processar o BU.");
        setProcessing(false);
      }
    },
    [fragments]
  );

  async function handleRevisarUrna() {
    if (fragments.length === 0) return;
    try {
      const merged = mergeParsedBus(fragments);
      await openConfirm({
        zona: merged.zona,
        secao: merged.secao,
        votes: merged.votes,
        rawText: merged.rawText,
        mode: "full",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao unir os QRs.");
    }
  }

  function handleCancelFragments() {
    setFragments([]);
    setScanNonce((n) => n + 1);
    setError(null);
    setNotice(null);
  }

  function handleTagCargo(numero: string, fromCargo: string, toCargo: string) {
    setDiscovered((prev) =>
      prev.map((d) =>
        d.numero === numero && d.cargo === fromCargo ? { ...d, cargo: toCargo } : d
      )
    );
  }

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
        mode: "featured",
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

      if (ingestMode === "full") {
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
          setError(result.message);
          setConfirmOpen(false);
          return;
        }
      } else {
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
      }
      setSuccess(`Enviado · Zona ${parsed.zona} · Seção ${parsed.secao}`);
      setConfirmOpen(false);
      setParsed(null);
      setLocal(null);
      setRows([]);
      setDiscovered([]);
      setNotice(null);
      setFragments([]);
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
          discovered={discovered}
          onTagCargo={handleTagCargo}
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
            <div className="space-y-2">
              {fragments.length > 0 && (
                <div
                  role="status"
                  className="rounded-xl border border-teal-600 bg-teal-50 px-3 py-2.5 text-sm text-teal-950"
                >
                  <p className="font-bold">
                    QR {fragments.length}
                    {fragments[fragments.length - 1]?.qrTotal
                      ? ` de ${fragments[fragments.length - 1].qrTotal}`
                      : ""}{" "}
                    lido — filme o próximo
                  </p>
                  <p className="mt-0.5 text-[11px] text-teal-800">
                    Zona {fragments[0].zona} · Seção {fragments[0].secao} ·{" "}
                    {fragments.reduce((n, f) => n + f.votes.length, 0)} pares neste
                    conjunto. QRs extras da mesma urna não são duplicata.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-teal-700 text-white hover:bg-teal-800"
                      onClick={() => void handleRevisarUrna()}
                      disabled={processing}
                    >
                      Revisar e enviar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-slate-300"
                      onClick={handleCancelFragments}
                    >
                      Cancelar urna
                    </Button>
                  </div>
                </div>
              )}
              <BuScanner
                onScan={(text) => void handleRawText(text)}
                busy={processing}
                resetKey={scanNonce}
                nextQr={fragments.length > 0}
              />
              <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                  Colar texto do BU (se o QR falhar)
                </summary>
                <PasteBuForm
                  busy={processing}
                  fragmentCount={fragments.length}
                  onSubmit={(text) => void handleRawText(text)}
                />
              </details>
            </div>
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

function PasteBuForm({
  busy,
  onSubmit,
  fragmentCount = 0,
}: {
  busy?: boolean;
  onSubmit: (text: string) => void;
  fragmentCount?: number;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="ZONA:001 SECA:0001 13:142 13131:51 …"
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800"
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          className="bg-teal-700 text-white hover:bg-teal-800"
          disabled={busy || !text.trim()}
        >
          Processar texto
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-slate-300"
          disabled={busy}
          onClick={() => setText(SAMPLE_BU_TEXT)}
        >
          Exemplo de teste
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-slate-300"
          disabled={busy}
          onClick={() =>
            setText(fragmentCount === 0 ? SAMPLE_TSE_QR_PART1 : SAMPLE_TSE_QR_PART2)
          }
        >
          Exemplo QR {fragmentCount === 0 ? "1/2" : "2/2"}
        </Button>
      </div>
    </form>
  );
}
