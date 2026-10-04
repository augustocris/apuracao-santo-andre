"use client";

import { useCallback, useState } from "react";
import { ManualBuForm, type ManualBuSubmit } from "@/components/fiscal/ManualBuForm";
import { ConfirmTransmitModal } from "@/components/fiscal/ConfirmTransmitModal";
import {
  padSecao,
  padZona,
  resolveConfirmRows,
  transmitVotes,
  urnaJaCadastrada,
  assertZonaPermitida,
} from "@/lib/data";
import { pickConfirmPreview } from "@/lib/fiscal-confirm";
import { duplicateFeedback, fiscalSuccessMessage } from "@/lib/fiscal-feedback";
import type { ConfirmVoteRow } from "@/lib/types";

export function AdminDigitarBu() {
  const [processing, setProcessing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [zona, setZona] = useState("");
  const [secao, setSecao] = useState("");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ConfirmVoteRow[]>([]);
  const [formResetKey, setFormResetKey] = useState(0);

  const handleManual = useCallback(async (payload: ManualBuSubmit) => {
    setProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      const z = padZona(payload.zona);
      const s = padSecao(payload.secao);
      await assertZonaPermitida(z);
      if (await urnaJaCadastrada(z, s)) {
        setError(duplicateFeedback(z, s).nextStep);
        return;
      }
      const resolved = await resolveConfirmRows(
        payload.votes.map((v) => ({
          numero: v.numero,
          quantidade: v.quantidade,
          cargo: v.cargo,
        }))
      );
      if (resolved.rows.length === 0) {
        throw new Error(
          "Nenhum número cadastrado corresponde aos votos. Verifique o cadastro."
        );
      }
      setZona(z);
      setSecao(s);
      setRows(resolved.rows);
      setRawText(
        [
          `MANUAL`,
          `ZONA:${z}`,
          `SECAO:${s}`,
          ...payload.votes.map(
            (v) => `CARG:${v.cargo} CAND:${v.numero} QTVO:${v.quantidade}`
          ),
        ].join("\n")
      );
      setConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar o envio.");
    } finally {
      setProcessing(false);
    }
  }, []);

  async function handleConfirm() {
    setTransmitting(true);
    setError(null);
    try {
      if (await urnaJaCadastrada(zona, secao)) {
        setError(duplicateFeedback(zona, secao).nextStep);
        setConfirmOpen(false);
        return;
      }
      const result = await transmitVotes({
        zona,
        secao,
        rawText,
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
      setSuccess(fiscalSuccessMessage(zona, secao));
      setConfirmOpen(false);
      setRows([]);
      setFormResetKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao transmitir.");
    } finally {
      setTransmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:p-5">
        <div>
          <h2 className="text-lg font-bold text-white">Digitar BU</h2>
          <p className="text-sm text-slate-400">
            Uma urna por zona + seção. Se já foi enviada, a central vê “já
            enviada”.
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            role="status"
            className="rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-100"
          >
            {success}
          </p>
        ) : null}
        {confirmOpen ? (
          <div className="rounded-xl bg-white p-2 text-slate-900">
            <ConfirmTransmitModal
              open
              onOpenChange={(open) => {
                if (!open) setConfirmOpen(false);
              }}
              zona={zona}
              secao={secao}
              preview={pickConfirmPreview(rows, [])}
              onConfirm={() => void handleConfirm()}
              onRescan={() => setConfirmOpen(false)}
              rescanLabel="Voltar"
              transmitting={transmitting}
              canSend={rows.length > 0}
            />
          </div>
        ) : (
          <div className="rounded-xl bg-[#f4f7f5] p-3 text-slate-900">
            <ManualBuForm
              onSubmit={(payload) => void handleManual(payload)}
              busy={processing || transmitting}
              resetKey={formResetKey}
            />
          </div>
        )}
    </div>
  );
}
