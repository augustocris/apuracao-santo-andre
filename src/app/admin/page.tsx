import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Telão ao vivo",
  description: "Apuração eleitoral em tempo real — Santo André.",
};

export default function AdminPage() {
  return (
    <main className="theme-admin dark min-h-full flex-1">
      <AdminDashboard />
    </main>
  );
}
