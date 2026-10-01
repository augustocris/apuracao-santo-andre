import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin — Apuração Santo André",
  description: "Cadastro, BUs pendentes e Digitar BU — Santo André.",
};

export default function AdminPage() {
  return (
    <main className="theme-admin dark flex min-h-full flex-1 flex-col">
      <AdminDashboard />
    </main>
  );
}
