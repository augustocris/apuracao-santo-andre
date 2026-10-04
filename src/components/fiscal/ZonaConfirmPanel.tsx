"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SANTO_ANDRE_ZONAS_FALLBACK } from "@/lib/zona-allowlist";
import type { ZonaConfigRow } from "@/lib/types";

export function ZonaConfirmPanel({
  zonas,
  secao,
  onConfirm,
  onCancel,
}: {
  zonas?: ZonaConfigRow[] | null;
  secao?: string;
  onConfirm: (zona: string, secao: string) => void;
  onCancel: () => void;
}) {
  const list =
    zonas && zonas.length > 0 ? zonas : SANTO_ANDRE_ZONAS_FALLBACK;
  const [picked, setPicked] = useState<string>("");
  const [secaoDraft, setSecaoDraft] = useState(secao ?? "");

  return (
    <section
      role="region"
      aria-labelledby="zona-manual-title"
      className="flex flex-col gap-3 rounded-xl border-2 border-teal-600 bg-white px-4 py-4 shadow-sm"
    >
      <h2 id="zona-manual-title" className="text-lg font-bold text-slate-900">
        QR lido — escolha a zona
      </h2>
      <p className="text-sm text-slate-600">
        O 01/02 não trouxe a zona. Só entram as 6 de Santo André.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {list.map((row) => (
          <Button
            key={row.zona}
            type="button"
            variant={picked === row.zona ? "default" : "outline"}
            className={`h-12 text-base font-bold ${
              picked === row.zona
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "border-2 border-teal-700/40 text-teal-900"
            }`}
            onClick={() => setPicked(row.zona)}
          >
            {row.zona}
          </Button>
        ))}
      </div>
      <label className="block text-sm font-semibold text-slate-800">
        Seção
        <input
          inputMode="numeric"
          value={secaoDraft}
          onChange={(e) => setSecaoDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0001"
          className="mt-1 h-12 w-full rounded-lg border-2 border-slate-300 px-3 text-base tabular-nums"
        />
      </label>
      <Button
        type="button"
        size="lg"
        className="h-12 bg-teal-700 text-base font-bold text-white hover:bg-teal-800"
        disabled={!picked || secaoDraft.replace(/\D/g, "").length < 1}
        onClick={() => onConfirm(picked, secaoDraft)}
      >
        Confirmar zona {picked || "—"}
      </Button>
      <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
        Filmar de novo
      </Button>
    </section>
  );
}
