import type { Metadata } from "next";
import { FiscalApp } from "@/components/fiscal/FiscalApp";

export const metadata: Metadata = {
  title: "Fiscal",
  description: "Escaneie e transmita Boletins de Urna — Santo André.",
};

export default function FiscalPage() {
  return (
    <main className="theme-fiscal min-h-full flex-1">
      <FiscalApp />
    </main>
  );
}
