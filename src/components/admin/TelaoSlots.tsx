"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { UserRound } from "lucide-react";
import { CARGO_SLOTS, labelCargoCurto, type CargoOficial } from "@/lib/cargos";
import type { MilestoneCelebrationEvent } from "@/lib/milestones";
import type { CargoRanking, RankingRow } from "@/lib/types";
import { cn, formatPercent, formatVotes } from "@/lib/utils";

export interface TelaoSlot {
  key: string;
  cargo: CargoOficial;
  label: string;
  row: RankingRow | null;
}

/** Build the fixed 5 TV slots from ranking groups (DB candidates). */
export function buildTelaoSlots(groups: CargoRanking[]): TelaoSlot[] {
  const byCargo = new Map(groups.map((g) => [g.cargo, g]));

  const pickOrdered = (cargo: CargoOficial): RankingRow[] => {
    const group = byCargo.get(cargo);
    if (!group) return [];
    return [...group.rankings].sort((a, b) =>
      a.candidato.numero.localeCompare(b.candidato.numero, "pt-BR", {
        numeric: true,
      })
    );
  };

  const slots: TelaoSlot[] = [];

  const de = pickOrdered("Deputado Estadual")[0] ?? null;
  slots.push({
    key: "dep-estadual",
    cargo: "Deputado Estadual",
    label: labelCargoCurto("Deputado Estadual"),
    row: de,
  });

  const df = pickOrdered("Deputado Federal")[0] ?? null;
  slots.push({
    key: "dep-federal",
    cargo: "Deputado Federal",
    label: labelCargoCurto("Deputado Federal"),
    row: df,
  });

  const senadores = pickOrdered("Senador");
  const senSlots = CARGO_SLOTS.Senador;
  for (let i = 0; i < senSlots; i++) {
    slots.push({
      key: `senador-${i + 1}`,
      cargo: "Senador",
      label: `Senador ${i + 1}`,
      row: senadores[i] ?? null,
    });
  }

  const gov = pickOrdered("Governador")[0] ?? null;
  slots.push({
    key: "governador",
    cargo: "Governador",
    label: "Governador",
    row: gov,
  });

  return slots;
}

function fireCardConfetti(canvas: HTMLCanvasElement) {
  const fire = confetti.create(canvas, {
    resize: true,
    useWorker: false,
    disableForReducedMotion: true,
  });
  const count = 90;
  fire({
    particleCount: Math.floor(count * 0.45),
    spread: 62,
    startVelocity: 28,
    origin: { x: 0.5, y: 0.55 },
    ticks: 180,
  });
  fire({
    particleCount: Math.floor(count * 0.28),
    angle: 60,
    spread: 50,
    startVelocity: 24,
    origin: { x: 0.15, y: 0.7 },
    ticks: 180,
  });
  fire({
    particleCount: Math.floor(count * 0.28),
    angle: 120,
    spread: 50,
    startVelocity: 24,
    origin: { x: 0.85, y: 0.7 },
    ticks: 180,
  });
}

interface SlotCardProps {
  slot: TelaoSlot;
  size: "tall" | "short";
  singleInCargo: boolean;
  celebration: MilestoneCelebrationEvent | null;
}

function SlotCard({ slot, size, singleInCargo, celebration }: SlotCardProps) {
  const empty = !slot.row;
  const votos = slot.row?.votos ?? 0;
  const pct = slot.row?.percentual ?? 0;
  const showPctStrong = !singleInCargo && !empty;
  const celebrating =
    !!celebration &&
    !!slot.row &&
    slot.row.candidato.id === celebration.candidatoId;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFiredId = useRef<string | null>(null);

  useEffect(() => {
    if (!celebrating || !celebration || !canvasRef.current) return;
    if (lastFiredId.current === celebration.id) return;
    lastFiredId.current = celebration.id;
    fireCardConfetti(canvasRef.current);
  }, [celebrating, celebration]);

  return (
    <article
      data-slot-key={slot.key}
      data-candidato-id={slot.row?.candidato.id ?? ""}
      data-celebrating={celebrating ? "1" : "0"}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/85 shadow-lg shadow-black/25",
        size === "tall" ? "p-4 md:p-5" : "p-3 md:p-4",
        empty && "border-dashed border-white/15 bg-slate-950/40",
        celebrating && "ring-2 ring-amber-300/70"
      )}
    >
      {celebrating ? (
        <>
          <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          />
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute inset-x-3 top-3 z-30",
              "animate-in fade-in zoom-in-95 duration-500",
              "rounded-xl border border-amber-300/50 bg-slate-950/90 px-3 py-2.5 text-center shadow-[0_0_28px_rgba(251,191,36,0.35)] backdrop-blur-md"
            )}
          >
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 md:text-xs">
              {celebration!.candidateName}
            </p>
            <p className="mt-1 text-sm font-bold leading-snug text-white md:text-base">
              {celebration!.message}
            </p>
          </div>
        </>
      ) : null}

      <p
        className={cn(
          "relative z-10 font-semibold uppercase tracking-[0.14em] text-teal-300/90",
          size === "tall" ? "text-xs md:text-sm" : "text-[10px] md:text-xs",
          celebrating && "opacity-40"
        )}
      >
        {slot.label}
      </p>

      {empty ? (
        <div className="relative z-10 mt-3 flex flex-1 flex-col items-center justify-center gap-2 text-slate-500">
          <UserRound className={size === "tall" ? "size-10" : "size-7"} />
          <p className="text-sm">Sem candidato cadastrado</p>
        </div>
      ) : (
        <div
          className={cn(
            "relative z-10 mt-2 flex min-h-0 flex-1 flex-col justify-between gap-2",
            celebrating && "pt-14"
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 font-bold text-white",
                size === "tall"
                  ? "size-16 text-lg md:size-20 md:text-xl"
                  : "size-11 text-sm md:size-12"
              )}
            >
              {slot.row!.candidato.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.row!.candidato.foto_url}
                  alt={slot.row!.candidato.nome}
                  className="size-full object-cover"
                />
              ) : (
                slot.row!.candidato.numero
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate font-bold leading-tight text-white",
                  size === "tall"
                    ? "text-2xl md:text-3xl lg:text-4xl"
                    : "text-lg md:text-xl lg:text-2xl"
                )}
              >
                {slot.row!.candidato.nome}
              </p>
              <p
                className={cn(
                  "mt-0.5 tabular-nums text-slate-400",
                  size === "tall" ? "text-sm md:text-base" : "text-xs md:text-sm"
                )}
              >
                Nº {slot.row!.candidato.numero}
              </p>
            </div>
          </div>

          <div className="mt-auto">
            <div className="flex items-end justify-between gap-2">
              <p
                className={cn(
                  "font-bold tabular-nums text-white",
                  size === "tall"
                    ? "text-3xl md:text-4xl lg:text-5xl"
                    : "text-2xl md:text-3xl",
                  singleInCargo && "text-amber-200"
                )}
              >
                {formatVotes(votos)}
                <span
                  className={cn(
                    "ml-1 font-medium text-slate-400",
                    size === "tall" ? "text-base md:text-lg" : "text-sm"
                  )}
                >
                  votos
                </span>
              </p>
              {showPctStrong && (
                <p
                  className={cn(
                    "shrink-0 font-bold tabular-nums text-teal-300",
                    size === "tall" ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
                  )}
                >
                  {formatPercent(pct)}
                </p>
              )}
              {singleInCargo && !empty && (
                <p
                  className={cn(
                    "shrink-0 tabular-nums text-slate-500",
                    size === "tall" ? "text-sm md:text-base" : "text-xs"
                  )}
                >
                  {formatPercent(pct)}
                </p>
              )}
            </div>
            <div
              className={cn(
                "mt-2 overflow-hidden rounded-full bg-slate-700",
                size === "tall" ? "h-2.5" : "h-1.5"
              )}
            >
              <div
                className="h-full rounded-full bg-teal-400 transition-all duration-700"
                style={{
                  width: `${Math.max(votos > 0 ? pct : 0, votos > 0 ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

interface TelaoSlotsProps {
  groups: CargoRanking[];
  celebration?: MilestoneCelebrationEvent | null;
}

export function TelaoSlots({ groups, celebration = null }: TelaoSlotsProps) {
  const slots = buildTelaoSlots(groups);
  const tall = slots.slice(0, 2);
  const short = slots.slice(2);

  const countInCargo = (cargo: CargoOficial) =>
    slots.filter((s) => s.cargo === cargo && s.row).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-[1.35] grid-cols-1 gap-3 md:grid-cols-2">
        {tall.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            size="tall"
            singleInCargo={countInCargo(slot.cargo) <= 1}
            celebration={celebration}
          />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        {short.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            size="short"
            singleInCargo={countInCargo(slot.cargo) <= 1}
            celebration={celebration}
          />
        ))}
      </div>
    </div>
  );
}
