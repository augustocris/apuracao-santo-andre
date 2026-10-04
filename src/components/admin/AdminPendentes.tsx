"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import { Button } from "@/components/ui/button";
import {
  listBusPendentes,
  markBuPendenteReprocessado,
  resolveBuVotes,
  subscribeDashboard,
  transmitBuCompleto,
  updateBuPendenteErro,
  urnaJaCadastrada,
  assertZonaPermitida,
} from "@/lib/data";
import { PENDENTES_POLL_MS } from "@/lib/live-load";
import { duplicateUrnaMessage } from "@/lib/fiscal-feedback";
import { pickConfirmPreview } from "@/lib/fiscal-confirm";
import {
  assertQrSetReadyToIngest,
  parseBuQrText,
} from "@/lib/parser/bu-qr";
import type { BuPendente, ConfirmVoteRow, DiscoveredVote, ParsedBu } from "@/lib/types";

export function AdminPendentes() {
  const [rows, setRows] = useState<BuPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    pendente: BuPendente;
    parsed: ParsedBu;
    featured: ConfirmVoteRow[];
    discovered: DiscoveredVote[];
  } | null>(null);
  const [transmitting, setTransmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listBusPendentes();
      setRows(list);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar a fila."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeDashboard(() => {
      void reload();
    }, PENDENTES_POLL_MS);
  }, [reload]);

  async function handleReprocessar(item: BuPendente) {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const parsed = parseBuQrText(item.raw_text);
      const merged = assertQrSetReadyToIngest([parsed]);
      await assertZonaPermitida(merged.zona);

      if (await urnaJaCadastrada(merged.zona, merged.secao)) {
        await updateBuPendenteErro(
          item.id,
          duplicateUrnaMessage(merged.zona, merged.secao)
        );
        setError(duplicateUrnaMessage(merged.zona, merged.secao));
        await reload();
        return;
      }

      const resolved = await resolveBuVotes(merged.votes);
      if (resolved.featured.length === 0 && resolved.discovered.length === 0) {
        throw new Error("Parser ok, mas nenhum voto para gravar.");
      }
      setConfirm({
        pendente: item,
        parsed: merged,
        featured: resolved.featured,
        discovered: resolved.discovered,
      });
    } catch (err) {
      const cause = err instanceof Error ? err.message : "Falha ao reprocessar.";
      try {
        await updateBuPendenteErro(item.id, cause);
      } catch {
        /* keep original */
      }
      setError(cause);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setTransmitting(true);
    setError(null);
    try {
      const result = await transmitBuCompleto({
        zona: confirm.parsed.zona,
        secao: confirm.parsed.secao,
        rawText: confirm.parsed.rawText,
        votes: [
          ...confirm.featured.map((r) => ({
            candidatoId: r.candidato.id,
            numero: r.candidato.numero,
            nome: r.candidato.nome,
            cargo: String(r.candidato.cargo),
            quantidade: r.quantidade,
          })),
          ...confirm.discovered,
        ],
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      await markBuPendenteReprocessado(confirm.pendente.id);
      setMessage(
        `BU zona ${confirm.parsed.zona} seção ${confirm.parsed.secao} enviada.`
      );
      setConfirm(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gravar o BU.");
    } finally {
      setTransmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">BUs pendentes / com erro</h2>
          <p className="text-sm text-slate-400">
            QR que o parser recusou fica aqui. Reprocessar tenta de novo sem o
            fiscal voltar ao papel.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-white/25 bg-white/5 text-white hover:bg-white/10"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100"
        >
          {message}
        </p>
      ) : null}

      {confirm ? (
        <div className="rounded-xl bg-white p-2 text-slate-900">
          <ConfirmTransmitModal
            open
            onOpenChange={(open) => {
              if (!open) setConfirm(null);
            }}
            zona={confirm.parsed.zona}
            secao={confirm.parsed.secao}
            preview={pickConfirmPreview(confirm.featured, confirm.discovered)}
            onConfirm={() => void handleConfirm()}
            onRescan={() => setConfirm(null)}
            rescanLabel="Voltar"
            transmitting={transmitting}
            canSend={
              confirm.featured.length > 0 || confirm.discovered.length > 0
            }
          />
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Carregando fila…
        </p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
          Nenhum BU pendente. Falhas de parse do fiscal aparecem aqui.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {item.zona && item.secao
                      ? `Zona ${item.zona} · Seção ${item.secao}`
                      : "Zona/seção não lidas"}
                  </p>
                  <p className="mt-1 text-xs text-red-200">{item.erro}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    }).format(new Date(item.created_at))}
                  </p>
                </div>
                <Button
                  type="button"
                  className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
                  disabled={busyId === item.id}
                  onClick={() => void handleReprocessar(item)}
                >
                  {busyId === item.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Reprocessar
                </Button>
              </div>
              <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-snug text-slate-300 whitespace-pre-wrap">
                {item.raw_text.slice(0, 2000)}
                {item.raw_text.length > 2000 ? "…" : ""}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
