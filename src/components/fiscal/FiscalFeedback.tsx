"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import type { FiscalFeedback } from "@/lib/fiscal-feedback";
import {
  fiscalSuccessMessage,
  hasWhatsappSuporte,
  whatsappHref,
  whatsappLabel,
} from "@/lib/fiscal-feedback";
import { cn } from "@/lib/utils";

export function WhatsAppSupport({
  number,
  className,
}: {
  number: string | null | undefined;
  className?: string;
}) {
  const href = whatsappHref(number);
  const label = whatsappLabel(number);
  const ready = hasWhatsappSuporte(number);

  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-snug", className)}>
      <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
      {ready && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2"
        >
          WhatsApp da central: {label}
        </a>
      ) : (
        <span>
          WhatsApp da central: <strong className="font-semibold">{label}</strong>
        </span>
      )}
    </p>
  );
}

export function FiscalSuccessCard({
  zona,
  secao,
}: {
  zona: string;
  secao: string;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-3 text-emerald-950"
    >
      <p className="flex items-start gap-2 text-base font-bold leading-tight">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        {fiscalSuccessMessage(zona, secao)}
      </p>
      <p className="mt-1 pl-7 text-xs font-medium text-emerald-900">
        Pode ir à próxima urna.
      </p>
    </div>
  );
}

export function FiscalErrorCard({
  error,
  whatsapp,
}: {
  error: FiscalFeedback;
  whatsapp?: string | null;
}) {
  const tone =
    error.kind === "duplicate"
      ? "border-amber-400 bg-amber-50 text-amber-950"
      : error.kind === "incomplete_qr"
        ? "border-teal-500 bg-teal-50 text-teal-950"
        : "border-red-400 bg-red-50 text-red-950";

  return (
    <div role="alert" className={cn("rounded-xl border-2 px-3 py-3", tone)}>
      <p className="text-sm font-bold">{error.title}</p>
      <p className="mt-1 text-xs font-medium leading-snug">{error.cause}</p>
      <p className="mt-2 text-xs font-semibold leading-snug">
        Próximo passo: {error.nextStep}
      </p>
      {error.kind !== "duplicate" && error.kind !== "incomplete_qr" ? (
        <WhatsAppSupport number={whatsapp} className="mt-2" />
      ) : null}
    </div>
  );
}
