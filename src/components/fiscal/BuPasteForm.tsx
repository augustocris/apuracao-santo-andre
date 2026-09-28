"use client";

import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SAMPLE_BU_TEXT } from "@/lib/parser/bu-qr";

interface BuPasteFormProps {
  onSubmit: (text: string) => void;
  busy?: boolean;
}

export function BuPasteForm({ onSubmit, busy }: BuPasteFormProps) {
  const [text, setText] = useState("");

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-800">
          Cole o texto lido do QR do BU
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"ZONA:001\nSECAO:0001\nCAND:13 QTVO:142\n..."}
          className="w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
          disabled={busy}
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="h-14 flex-1 bg-teal-700 text-base font-semibold text-white hover:bg-teal-800"
          disabled={busy || !text.trim()}
          onClick={() => onSubmit(text)}
        >
          <ClipboardPaste className="size-5" />
          Processar texto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 border-2 border-slate-300 text-base"
          disabled={busy}
          onClick={() => setText(SAMPLE_BU_TEXT)}
        >
          Usar exemplo
        </Button>
      </div>
    </div>
  );
}
