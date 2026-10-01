import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listBusPendentes,
  markBuPendenteReprocessado,
  saveBuPendente,
} from "./data";
import { parseBuQrText } from "./parser/bu-qr";
import { SAMPLE_TSE_QR_PART1 } from "./parser/bu-qr";

describe("fila de BUs pendentes (mock)", () => {
  it("persists raw payload on parse-style failure", async () => {
    const raw = "isto nao e um boletim";
    const row = await saveBuPendente({
      rawText: raw,
      erro: "Zona não encontrada no QR.",
    });
    assert.ok(row);
    assert.equal(row?.raw_text, raw);
    assert.equal(row?.status, "pendente");
    const list = await listBusPendentes();
    assert.ok(list.some((p) => p.id === row?.id));
  });

  it("does not ingest votes from incomplete 1 de 2 when reprocessing a single part", () => {
    const parsed = parseBuQrText(SAMPLE_TSE_QR_PART1);
    assert.equal(parsed.qrIndex, 1);
    assert.equal(parsed.qrTotal, 2);
    assert.ok(parsed.votes.length > 0);
  });

  it("marks a pending BU as reprocessado", async () => {
    const row = await saveBuPendente({
      rawText: "ZONA:9 SECA:9 lixo",
      erro: "falha",
      zona: "009",
      secao: "0009",
    });
    assert.ok(row);
    await markBuPendenteReprocessado(row!.id);
    const list = await listBusPendentes();
    assert.equal(list.some((p) => p.id === row?.id), false);
  });
});
