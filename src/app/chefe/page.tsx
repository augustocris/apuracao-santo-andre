import type { Metadata } from "next";
import { ChefeRanking } from "@/components/chefe/ChefeRanking";

export const metadata: Metadata = {
  title: "Chefe",
  description: "Ranking completo da apuração paralela — Santo André.",
};

export default function ChefePage() {
  return (
    <main className="theme-fiscal flex min-h-dvh flex-1 flex-col bg-[#f4f7f5] md:h-dvh md:max-h-dvh md:overflow-hidden">
      <ChefeRanking />
    </main>
  );
}
