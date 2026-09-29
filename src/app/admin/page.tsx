import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Apuração Antecipada - Santo André",
  description: "Apuração antecipada em tempo real — Santo André.",
};

export default function AdminPage() {
  return (
    <main className="theme-admin dark flex h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
      <AdminDashboard />
    </main>
  );
}
