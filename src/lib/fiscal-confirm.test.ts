import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickConfirmPreview } from "./fiscal-confirm";
import type { ConfirmVoteRow, DiscoveredVote } from "./types";

function row(
  partial: Partial<ConfirmVoteRow["candidato"]> & { quantidade: number }
): ConfirmVoteRow {
  return {
    quantidade: partial.quantidade,
    candidato: {
      id: partial.id ?? `id-${partial.numero}`,
      numero: partial.numero ?? "13",
      nome: partial.nome ?? "Nome",
      cargo: partial.cargo ?? "Governador",
      foto_url: null,
      origem: partial.origem ?? "cadastro",
    },
  };
}

describe("pickConfirmPreview", () => {
  it("picks one of the 5 oficiais that appears on the BU (highest votes)", () => {
    const featured: ConfirmVoteRow[] = [
      row({
        id: "gov",
        numero: "13",
        nome: "Maria Silva",
        cargo: "Governador",
        quantidade: 40,
      }),
      row({
        id: "df",
        numero: "1313",
        nome: "Ana Costa",
        cargo: "Deputado Federal",
        quantidade: 110,
      }),
    ];
    const preview = pickConfirmPreview(featured, []);
    assert.equal(preview?.numero, "1313");
    assert.equal(preview?.quantidade, 110);
  });

  it("skips Presidente when a campaign official is present", () => {
    const featured: ConfirmVoteRow[] = [
      row({
        id: "pr",
        numero: "13",
        nome: "Presidente X",
        cargo: "Presidente",
        quantidade: 200,
        origem: "bu",
      }),
      row({
        id: "gov",
        numero: "10",
        nome: "Tarcísio",
        cargo: "Governador",
        quantidade: 8,
      }),
    ];
    const preview = pickConfirmPreview(featured, []);
    assert.equal(preview?.cargo, "Governador");
    assert.equal(preview?.numero, "10");
  });

  it("falls back to one parsed candidate with votes when none of the 5 appear", () => {
    const discovered: DiscoveredVote[] = [
      {
        numero: "4545",
        nome: "Paulo Serra",
        cargo: "Deputado Federal",
        quantidade: 11,
      },
      {
        numero: "17",
        nome: "Candidato 17",
        cargo: "Presidente",
        quantidade: 3,
      },
    ];
    const preview = pickConfirmPreview([], discovered);
    assert.equal(preview?.numero, "4545");
    assert.equal(preview?.quantidade, 11);
  });

  it("uses a featured Presidente when the 5 oficiais are absent", () => {
    const featured: ConfirmVoteRow[] = [
      row({
        id: "pr",
        numero: "13",
        nome: "Presidente X",
        cargo: "Presidente",
        quantidade: 200,
        origem: "bu",
      }),
    ];
    const preview = pickConfirmPreview(featured, []);
    assert.equal(preview?.cargo, "Presidente");
    assert.equal(preview?.quantidade, 200);
  });

  it("returns null when there is nobody with votes", () => {
    assert.equal(pickConfirmPreview([], []), null);
  });
});
