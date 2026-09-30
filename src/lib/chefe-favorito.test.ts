import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterChefeRankingRows } from "./chefe-ranking";
import { setCandidatoFavorito, transmitBuCompleto } from "./data";
import {
  getMockBoletins,
  getMockCandidatos,
  upsertMockCandidatos,
} from "./mock-store";
import {
  SAMPLE_TSE_QR_PART1,
  SAMPLE_TSE_QR_PART2,
  mergeParsedBus,
  parseBuQrText,
} from "./parser/bu-qr";
import type { CargoRanking } from "./types";

describe("setCandidatoFavorito", () => {
  it("toggles cadastro, catalogo and bu rows", async () => {
    upsertMockCandidatos([
      {
        numero: "88888",
        nome: "Catalogo Fav",
        cargo: "Deputado Estadual",
        foto_url: null,
        origem: "catalogo",
        favorito: false,
      },
    ]);
    const cadastro = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    const bu = getMockCandidatos().find((c) => c.numero === "99999");
    const catalogo = getMockCandidatos().find((c) => c.numero === "88888");
    assert.ok(cadastro && bu && catalogo);

    const a = await setCandidatoFavorito(cadastro.id, true);
    const b = await setCandidatoFavorito(bu.id, true);
    const c = await setCandidatoFavorito(catalogo.id, true);
    assert.equal(a.favorito, true);
    assert.equal(b.favorito, true);
    assert.equal(c.favorito, true);
    assert.equal(
      getMockCandidatos().find((x) => x.id === cadastro.id)?.favorito,
      true
    );
    assert.equal(
      getMockCandidatos().find((x) => x.id === bu.id)?.favorito,
      true
    );
    assert.equal(
      getMockCandidatos().find((x) => x.id === catalogo.id)?.favorito,
      true
    );
  });
});

describe("filterChefeRankingRows", () => {
  const groups: CargoRanking[] = [
    {
      cargo: "Deputado Estadual",
      totalVotos: 30,
      rankings: [
        {
          votos: 20,
          percentual: 66,
          candidato: {
            id: "de-1",
            numero: "13131",
            nome: "Roberto Alves",
            cargo: "Deputado Estadual",
            foto_url: null,
            origem: "cadastro",
            favorito: true,
          },
        },
        {
          votos: 10,
          percentual: 33,
          candidato: {
            id: "de-2",
            numero: "99999",
            nome: "Candidato 99999",
            cargo: "Deputado Estadual",
            foto_url: null,
            origem: "bu",
            favorito: false,
          },
        },
      ],
    },
    {
      cargo: "Presidente",
      totalVotos: 5,
      rankings: [
        {
          votos: 5,
          percentual: 100,
          candidato: {
            id: "pr-1",
            numero: "17",
            nome: "Candidato 17",
            cargo: "Presidente",
            foto_url: null,
            origem: "bu",
            favorito: true,
          },
        },
      ],
    },
  ];

  it("combines cargo + somente favoritos + search", () => {
    const deFav = filterChefeRankingRows(groups, {
      cargoFilter: "Deputado Estadual",
      sort: "votos",
      query: "",
      favoritoFilter: "favoritos",
    });
    assert.equal(deFav.length, 1);
    assert.equal(deFav[0].candidato.numero, "13131");

    const searchFav = filterChefeRankingRows(groups, {
      cargoFilter: "todos",
      sort: "nome",
      query: "17",
      favoritoFilter: "favoritos",
    });
    assert.equal(searchFav.length, 1);
    assert.equal(searchFav[0].candidato.cargo, "Presidente");
  });
});

describe("multi-QR merge then single ingest", () => {
  it("writes one urna after merging complementary QRs", async () => {
    const a = parseBuQrText(SAMPLE_TSE_QR_PART1);
    const b = parseBuQrText(SAMPLE_TSE_QR_PART2);
    const merged = mergeParsedBus([a, b]);
    const zona = merged.zona;
    const secao = "0777";
    const result = await transmitBuCompleto({
      zona,
      secao,
      rawText: `${merged.rawText}`,
      votes: merged.votes.map((v) => ({
        numero: v.numero,
        nome: v.nome,
        cargo: v.cargo,
        quantidade: v.quantidade,
      })),
    });
    assert.equal(result.ok, true);
    const rows = getMockBoletins().filter(
      (row) => row.zona === zona && row.secao === secao
    );
    assert.ok(rows.length >= 2);
    const keys = new Set(rows.map((r) => `${r.zona}|${r.secao}`));
    assert.equal(keys.size, 1);

    const dup = await transmitBuCompleto({
      zona,
      secao,
      rawText: "again",
      votes: [
        {
          numero: "17",
          nome: "Candidato 17",
          cargo: "Presidente",
          quantidade: 1,
        },
      ],
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) {
      assert.equal(dup.duplicate, true);
    }
  });
});
