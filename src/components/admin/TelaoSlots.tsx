"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { UserRound } from "lucide-react";
import { CARGO_SLOTS, isFeaturedCandidato, labelCargoCurto, type CargoOficial } from "@/lib/cargos";
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
    return [...group.rankings]
      .filter((row) => isFeaturedCandidato(row.candidato.origem))
      .sort((a, b) =>
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
    colors: ["#FFDE00", "#00ADEF", "#FFFFFF", "#003B7E"],
    ticks: 180,
  });
  fire({
    particleCount: Math.floor(count * 0.28),
    angle: 60,
    spread: 50,
    startVelocity: 24,
    origin: { x: 0.15, y: 0.7 },
    colors: ["#FFDE00", "#00ADEF", "#FFFFFF"],
    ticks: 180,
  });
  fire({
    particleCount: Math.floor(count * 0.28),
    angle: 120,
    spread: 50,
    startVelocity: 24,
    origin: { x: 0.85, y: 0.7 },
    colors: ["#FFDE00", "#00ADEF", "#FFFFFF"],
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
  const fotoUrl = slot.row?.candidato.foto_url?.trim() || null;
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
        "relative flex h-full min-h-0 overflow-hidden rounded-xl border border-white/15 bg-[#002a5c]/95 shadow-lg shadow-black/35 md:rounded-2xl",
        empty && "border-dashed border-white/20 bg-[#001a3a]/70",
        celebrating && "ring-2 ring-[#FFDE00]/80"
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
              "pointer-events-none absolute inset-x-2 top-1.5 z-30 md:inset-x-3 md:top-3",
              "animate-in fade-in zoom-in-95 duration-500",
              "rounded-lg border border-[#FFDE00]/55 bg-[#001530]/92 px-2 py-1.5 text-center shadow-[0_0_28px_rgba(255,222,0,0.35)] backdrop-blur-md md:rounded-xl md:px-3 md:py-2.5"
            )}
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FFDE00] md:text-xs">
              {celebration!.candidateName}
            </p>
            <p className="mt-0.5 text-xs font-bold leading-snug text-white md:mt-1 md:text-base">
              {celebration!.message}
            </p>
          </div>
        </>
      ) : null}

      {/* Content column (left) + photo column (right) */}
      <div
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 flex-1 items-stretch",
          size === "tall"
            ? "gap-2 p-2 md:gap-4 md:p-5"
            : "gap-2 p-1.5 md:gap-2.5 md:p-4"
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.14em] text-[#00ADEF]",
              size === "tall"
                ? "text-[10px] md:text-sm"
                : "text-[9px] md:text-xs",
              celebrating && "opacity-40"
            )}
          >
            {slot.label}
          </p>

          {empty ? (
            <div className="mt-1 flex flex-1 flex-col items-center justify-center gap-1 text-white/40 md:mt-3 md:gap-2">
              <UserRound
                className={
                  size === "tall" ? "size-6 md:size-10" : "size-5 md:size-7"
                }
              />
              <p className="text-[11px] md:text-sm">Sem candidato cadastrado</p>
            </div>
          ) : (
            <div
              className={cn(
                "mt-0.5 flex min-h-0 flex-1 flex-col justify-between gap-1 md:mt-2 md:gap-2",
                celebrating && "pt-10 md:pt-14"
              )}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate font-bold leading-tight text-white",
                    size === "tall"
                      ? "text-base md:text-3xl lg:text-4xl"
                      : "text-sm md:text-xl lg:text-2xl"
                  )}
                >
                  {slot.row!.candidato.nome}
                </p>
                <p
                  className={cn(
                    "mt-0 tabular-nums text-white/55 md:mt-0.5",
                    size === "tall"
                      ? "text-[11px] md:text-base"
                      : "text-[10px] md:text-sm"
                  )}
                >
                  Nº {slot.row!.candidato.numero}
                </p>
              </div>

              <div className="mt-auto">
                <div className="flex items-end justify-between gap-1.5">
                  <p
                    className={cn(
                      "font-bold tabular-nums leading-none text-[#FFDE00]",
                      size === "tall"
                        ? "text-xl md:text-4xl lg:text-5xl"
                        : "text-lg md:text-3xl"
                    )}
                  >
                    {formatVotes(votos)}
                    <span
                      className={cn(
                        "ml-1 font-medium text-white/55",
                        size === "tall"
                          ? "text-[11px] md:text-lg"
                          : "text-[10px] md:text-sm"
                      )}
                    >
                      votos
                    </span>
                  </p>
                  {showPctStrong && (
                    <p
                      className={cn(
                        "shrink-0 font-bold tabular-nums leading-none text-[#00ADEF]",
                        size === "tall"
                          ? "text-base md:text-3xl"
                          : "text-sm md:text-2xl"
                      )}
                    >
                      {formatPercent(pct)}
                    </p>
                  )}
                  {singleInCargo && !empty && (
                    <p
                      className={cn(
                        "shrink-0 tabular-nums text-white/40",
                        size === "tall"
                          ? "text-[11px] md:text-base"
                          : "text-[10px] md:text-xs"
                      )}
                    >
                      {formatPercent(pct)}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-1 overflow-hidden rounded-full bg-[#001a3a] md:mt-2",
                    size === "tall" ? "h-1.5 md:h-2.5" : "h-1 md:h-1.5"
                  )}
                >
                  <div
                    className="h-full rounded-full bg-[#00ADEF] transition-all duration-700"
                    style={{
                      width: `${Math.max(votos > 0 ? pct : 0, votos > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/*
          Photo column: height = card content (self-stretch).
          Width from aspect-ratio so thin cards get a smaller portrait/square
          instead of a wide strip that only shows the top of the head.
          Desktop/TV tall cards keep a wider % column for impact.
        */}
        <div
          className={cn(
            "relative shrink-0 self-stretch overflow-hidden rounded-lg md:rounded-xl",
            size === "tall"
              ? "aspect-[3/4] h-auto w-auto max-w-[36%] md:aspect-auto md:w-[32%] md:min-w-[7rem] md:max-w-[11rem]"
              : "aspect-[4/5] h-auto w-auto max-w-[32%] sm:max-w-[5.5rem] md:max-w-[7.5rem]",
            empty && "bg-[#001a3a]/50"
          )}
          aria-hidden={empty}
        >
          {empty ? (
            <div className="flex h-full items-center justify-center text-white/25">
              <UserRound
                className={
                  size === "tall" ? "size-7 md:size-12" : "size-5 md:size-8"
                }
              />
            </div>
          ) : fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoUrl}
              alt=""
              className="h-full w-full object-cover object-[center_15%]"
            />
          ) : (
            <div
              className={cn(
                "flex h-full w-full items-center justify-center bg-gradient-to-b from-[#004a9e] to-[#002a5c] font-bold text-white",
                size === "tall"
                  ? "text-lg md:text-4xl"
                  : "text-sm md:text-2xl"
              )}
            >
              {slot.row!.candidato.numero}
            </div>
          )}
        </div>
      </div>
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
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 md:gap-3">
      {/*
        Mobile: flex-[2]/[3] ≈ equal height per stacked card (2 deps + 3 short).
        Desktop/TV: keep taller deputy row + 3-up short row.
      */}
      <div className="grid min-h-0 flex-[2] grid-cols-1 gap-1.5 md:flex-[1.35] md:grid-cols-2 md:gap-3">
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
      <div className="grid min-h-0 flex-[3] grid-cols-1 gap-1.5 sm:grid-cols-3 sm:flex-1 md:gap-3">
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
