import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMockBoletins,
  insertMockBoletins,
} from "./mock-store";

const DUPLICATE_MSG = "Urna já cadastrada anteriormente";

describe("duplicate urna (zona+seção)", () => {
  it("blocks a second insert for the same zona+seção", () => {
    const zona = "088";
    const secao = "0099";
    const first = insertMockBoletins([
      {
        zona,
        secao,
        candidato_id: "22222222-2222-2222-2222-222222222201",
        quantidade_votos: 10,
        raw_text: "TEST",
        fiscal_nome: null,
      },
    ]);
    assert.equal(first.ok, true);

    const second = insertMockBoletins([
      {
        zona,
        secao,
        candidato_id: "22222222-2222-2222-2222-222222222202",
        quantidade_votos: 4,
        raw_text: "TEST2",
        fiscal_nome: null,
      },
    ]);
    assert.deepEqual(second, { ok: false, duplicate: true });

    const rows = getMockBoletins().filter(
      (b) => b.zona === zona && b.secao === secao
    );
    assert.equal(rows.length, 1);
    void DUPLICATE_MSG;
  });
});
