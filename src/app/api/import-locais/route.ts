import { NextResponse } from "next/server";
import { importLocais } from "@/lib/data";

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("zona") &&
    (header.includes("secao") || header.includes("seção"));
  const start = hasHeader ? 1 : 0;

  return lines.slice(start).map((line) => {
    const parts = line.split(/[,;|\t]/).map((p) => p.trim());
    return {
      zona: parts[0] ?? "",
      secao: parts[1] ?? "",
      nome_escola: parts[2] ?? "",
      bairro: parts[3] || null,
    };
  });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let rows: Array<{
      zona: string;
      secao: string;
      nome_escola: string;
      bairro?: string | null;
    }> = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : body.locais ?? [];
    } else {
      const text = await request.text();
      rows = parseCsv(text);
    }

    const valid = rows.filter(
      (r) => r.zona && r.secao && r.nome_escola
    );
    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Nenhum local válido. Envie JSON array ou CSV (zona,secao,nome_escola,bairro)." },
        { status: 400 }
      );
    }

    const count = await importLocais(valid);
    return NextResponse.json({ ok: true, upserted: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao importar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
