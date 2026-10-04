import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transmitBuCompleto } from "./data";
import {
  getMockBoletins,
  insertMockBoletins,
} from "./mock-store";

describe("duplicate urna (zona+seção+IDUE)", () => {
  it("blocks a second insert for the same urna IDUE", () => {
    const zona = "088";
    const secao = "0099";
    const first = insertMockBoletins([
      {
        zona,
        secao,
        urna_id: "11",
        candidato_id: "22222222-2222-2222-2222-222222222201",
        quantidade_votos: 10,
        raw_text: "IDUE:11",
        fiscal_nome: null,
      },
    ]);
    assert.equal(first.ok, true);

    const same = insertMockBoletins([
      {
        zona,
        secao,
        urna_id: "11",
        candidato_id: "22222222-2222-2222-2222-222222222202",
        quantidade_votos: 4,
        raw_text: "IDUE:11",
        fiscal_nome: null,
      },
    ]);
    assert.deepEqual(same, { ok: false, duplicate: true });
  });

  it("allows a second BU in the same seção when IDUE differs", async () => {
    const zona = "383";
    const secao = "0401";
    const first = await transmitBuCompleto({
      zona,
      secao,
      urnaId: "77",
      rawText: "SEQL:01/04 IDUE:77 ZONA:383 SECA:0401 CARG:1 13:10",
      votes: [
        {
          numero: "13",
          nome: "Candidato 13",
          cargo: "Presidente",
          quantidade: 10,
        },
      ],
    });
    assert.equal(first.ok, true);

    const second = await transmitBuCompleto({
      zona,
      secao,
      urnaId: "99",
      rawText: "SEQL:01/04 IDUE:99 ZONA:383 SECA:0401 CARG:1 13:8",
      votes: [
        {
          numero: "13",
          nome: "Candidato 13",
          cargo: "Presidente",
          quantidade: 8,
        },
      ],
    });
    assert.equal(second.ok, true);
    const rows = getMockBoletins().filter(
      (b) => b.zona === zona && b.secao === secao
    );
    const ids = new Set(rows.map((b) => b.urna_id));
    assert.equal(ids.has("77"), true);
    assert.equal(ids.has("99"), true);
  });
});
