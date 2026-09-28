import Link from "next/link";
import { MonitorPlay, Smartphone } from "lucide-react";

export default function HomePage() {
  return (
    <main className="theme-fiscal flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-5 py-12">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
            Santo André
          </p>
          <h1 className="font-[family-name:var(--font-source-serif)] text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
            Apuração Eleitoral Paralela
          </h1>
          <p className="max-w-xl text-lg text-slate-700">
            Fiscais escaneiam o QR do Boletim de Urna no celular. O telão
            atualiza os resultados em tempo real.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/fiscal"
            className="group rounded-3xl border-2 border-teal-700/20 bg-white/80 p-6 shadow-sm transition hover:border-teal-700 hover:shadow-md"
          >
            <Smartphone className="mb-3 size-8 text-teal-700" />
            <h2 className="text-xl font-bold text-slate-900">Área do Fiscal</h2>
            <p className="mt-1 text-sm text-slate-600">
              Escanear BU, confirmar votos e transmitir.
            </p>
          </Link>
          <Link
            href="/admin"
            className="group rounded-3xl border-2 border-slate-800/15 bg-slate-950 p-6 text-white shadow-sm transition hover:border-amber-400/50"
          >
            <MonitorPlay className="mb-3 size-8 text-amber-300" />
            <h2 className="text-xl font-bold">Telão / Admin</h2>
            <p className="mt-1 text-sm text-slate-300">
              Ranking ao vivo, progresso e feed de urnas.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
