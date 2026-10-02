import { NextResponse } from "next/server";
import { parseChapadaPayload, summarizeChapadaParse } from "@/lib/chapada";
import { importCandidatos } from "@/lib/data";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const origemParam = url.searchParams.get("origem");
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let origem: "catalogo" | "cadastro" =
      origemParam === "cadastro" ? "cadastro" : "catalogo";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body && typeof body === "object" && body.origem === "cadastro") {
        origem = "cadastro";
      }
      if (body && typeof body === "object" && body.origem === "catalogo") {
        origem = "catalogo";
      }
      text = JSON.stringify(
        Array.isArray(body) ? body : body.candidatos ?? body
      );
    } else {
      text = await request.text();
    }

    const parsed = parseChapadaPayload(text);
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            parsed.errors[0] ??
            "Nenhum candidato válido. Importe o CSV do TSE de SP e o de Brasil/Presidente (SG_UF=BR), ou numero,nome,cargo.",
          details: parsed.errors,
          skipped: parsed.skipped,
          format: parsed.format,
        },
        { status: 400 }
      );
    }

    const result = await importCandidatos(parsed.rows, { origem });
    return NextResponse.json({
      ok: true,
      upserted: result.upserted,
      skippedCadastro: result.skippedCadastro,
      duplicates: result.duplicates,
      sqPersisted: result.sqPersisted,
      skipped: parsed.skipped,
      format: parsed.format,
      summary: summarizeChapadaParse(parsed),
      warnings: parsed.errors,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao importar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
