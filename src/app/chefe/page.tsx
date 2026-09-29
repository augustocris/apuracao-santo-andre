import type { Metadata } from "next";
import { ChefeRanking } from "@/components/chefe/ChefeRanking";

export const metadata: Metadata = {
  title: "Chefe",
  description: "Ranking completo da apuração paralela — Santo André.",
};

export default function ChefePage() {
  return (
    <main className="theme-fiscal min-h-full flex-1 bg-[#f4f7f5]">
      <ChefeRanking />
    </main>
  );
}
