import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBusRecebidasReport } from "./bus-recebidas";

describe("buildBusRecebidasReport", () => {
  it("lists distinct zona+seção ordered, with school only when mapped", () => {
    const report = buildBusRecebidasReport(
      [
        { zona: "383", secao: "401" },
        { zona: "383", secao: "401" },
        { zona: "002", secao: "10" },
        { zona: "383", secao: "12" },
        { zona: "", secao: "1" },
      ],
      [
        {
          zona: "383",
          secao: "401",
          nome_escola: "EMEF Centro",
        },
        {
          zona: "002",
          secao: "0010",
          nome_escola: "   ",
        },
      ],
      { secoes_esperadas: 10 },
      "mock"
    );

    assert.equal(report.urnasRecebidas, 3);
    assert.equal(report.secoesEsperadas, 10);
    assert.equal(report.secoesFaltam, 7);
    assert.deepEqual(
      report.rows.map((r) => `${r.zona}|${r.secao}`),
      ["002|0010", "383|0012", "383|0401"]
    );
    assert.equal(report.rows[0].escola, null);
    assert.equal(report.rows[1].escola, null);
    assert.equal(report.rows[2].escola, "EMEF Centro");
    assert.equal(report.zonas.length, 2);
    assert.equal(report.zonas[0].zona, "002");
    assert.equal(report.zonas[0].recebidas, 1);
    assert.equal(report.zonas[1].zona, "383");
    assert.equal(report.zonas[1].recebidas, 2);
  });

  it("returns empty list without inventing schools", () => {
    const report = buildBusRecebidasReport(
      [],
      [{ zona: "001", secao: "0001", nome_escola: "Escola Fantasma" }],
      { secoes_esperadas: 1744 },
      "supabase"
    );
    assert.equal(report.urnasRecebidas, 0);
    assert.equal(report.secoesFaltam, 1744);
    assert.deepEqual(report.rows, []);
    assert.deepEqual(report.zonas, []);
    assert.equal(report.mode, "supabase");
  });
});
