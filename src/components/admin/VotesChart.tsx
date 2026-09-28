"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { RankingRow } from "@/lib/types";

interface VotesChartProps {
  rankings: RankingRow[];
}

const COLORS = ["#fbbf24", "#2dd4bf", "#38bdf8", "#a3e635", "#fb7185"];

export function VotesChart({ rankings }: VotesChartProps) {
  const data = rankings.slice(0, 8).map((r) => ({
    name: r.candidato.nome.split(" ")[0],
    fullName: r.candidato.nome,
    votos: r.votos,
    numero: r.candidato.numero,
  }));

  if (data.every((d) => d.votos === 0)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/20 text-slate-400">
        Gráfico aguardando votos
      </div>
    );
  }

  return (
    <div className="h-72 w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: "#cbd5e1" }} />
          <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1" }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.1)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 12,
              color: "#f8fafc",
            }}
            formatter={(value) => [
              new Intl.NumberFormat("pt-BR").format(Number(value ?? 0)),
              "Votos",
            ]}
            labelFormatter={(_, payload) =>
              String(payload?.[0]?.payload?.fullName ?? "")
            }
          />
          <Bar dataKey="votos" radius={[8, 8, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
