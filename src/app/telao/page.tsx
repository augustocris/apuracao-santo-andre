import type { Metadata } from "next";
import { TelaoScreen } from "@/components/admin/TelaoScreen";

export const metadata: Metadata = {
  title: "Telão — Apuração Antecipada - Santo André",
  description: "Telão ao vivo da apuração antecipada — Santo André.",
};

export default function TelaoPage() {
  return (
    <main className="theme-admin dark flex h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
      <TelaoScreen />
    </main>
  );
}
