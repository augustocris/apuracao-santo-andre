import { NextResponse } from "next/server";
import { importCandidatos } from "@/lib/data";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let rows: Array<{
      numero: string;
      nome: string;
      cargo: string;
      foto_url?: string | null;
    }> = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : body.candidatos ?? [];
    } else {
      const text = await request.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const header = lines[0]?.toLowerCase() ?? "";
      const hasHeader = header.includes("numero") || header.includes("nome");
      const start = hasHeader ? 1 : 0;
      rows = lines.slice(start).map((line) => {
        const parts = line.split(/[,;|\t]/).map((p) => p.trim());
        return {
          numero: parts[0] ?? "",
          nome: parts[1] ?? "",
          cargo: parts[2] ?? "Prefeito",
          foto_url: parts[3] || null,
        };
      });
    }

    const valid = rows.filter((r) => r.numero && r.nome && r.cargo);
    if (valid.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum candidato válido. Envie JSON array ou CSV (numero,nome,cargo,foto_url).",
        },
        { status: 400 }
      );
    }

    const count = await importCandidatos(valid);
    return NextResponse.json({ ok: true, upserted: count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao importar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
