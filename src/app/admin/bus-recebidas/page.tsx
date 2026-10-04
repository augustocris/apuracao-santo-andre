import type { Metadata } from "next";
import { BusRecebidasReport } from "@/components/admin/BusRecebidasReport";
import { PinGate } from "@/components/admin/PinGate";

export const metadata: Metadata = {
  title: "BUs recebidas — Admin",
  description: "Zonas e seções já recebidas na apuração de Santo André.",
};

export default function BusRecebidasPage() {
  return (
    <main className="theme-admin dark flex min-h-full flex-1 flex-col print:bg-white">
      <PinGate title="Acesso admin" description="Digite o PIN.">
        <div className="min-h-full flex-1 bg-[#f4f7f5] text-slate-900">
          <BusRecebidasReport />
        </div>
      </PinGate>
    </main>
  );
}
