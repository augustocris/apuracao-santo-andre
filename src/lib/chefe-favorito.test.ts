import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chefeMiniaturaFallback,
  filterChefeRankingRows,
} from "./chefe-ranking";
import { percentualNoCargo } from "./utils";
import {
  buildDashboardSnapshot,
  setCandidatoFavorito,
  transmitBuCompleto,
} from "./data";
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

  it("shows origem=bu Indefinido with votes in Todos (simulação TSE)", () => {
    const withIndef: CargoRanking[] = [
      ...groups,
      {
        cargo: "Indefinido",
        totalVotos: 40,
        rankings: [
          {
            votos: 40,
            percentual: 100,
            candidato: {
              id: "indef-bu",
              numero: "13",
              nome: "Candidato 13",
              cargo: "Indefinido",
              foto_url: null,
              origem: "bu",
              favorito: false,
            },
          },
        ],
      },
    ];
    const todos = filterChefeRankingRows(withIndef, {
      cargoFilter: "todos",
      sort: "votos",
      query: "",
      favoritoFilter: "todos",
    });
    const bu = todos.find((r) => r.candidato.id === "indef-bu");
    assert.ok(bu);
    assert.equal(bu.votos, 40);
    assert.equal(bu.candidato.origem, "bu");
    const presidente = todos.find((r) => r.candidato.cargo === "Presidente");
    assert.ok(presidente);
    assert.notEqual(presidente.candidato.cargo, "Indefinido");
  });
});

describe("percentual no cargo", () => {
  it("does not recompute % from the filtered (favoritos) subset", () => {
    const groups: CargoRanking[] = [
      {
        cargo: "Deputado Federal",
        totalVotos: 110,
        rankings: [
          {
            votos: 70,
            percentual: 100,
            candidato: {
              id: "df-ana",
              numero: "1313",
              nome: "Ana Costa",
              cargo: "Deputado Federal",
              foto_url: null,
              origem: "cadastro",
              favorito: false,
            },
          },
          {
            votos: 22,
            percentual: 100,
            candidato: {
              id: "df-keila",
              numero: "1001",
              nome: "Keila Giselle",
              cargo: "Deputado Federal",
              foto_url: null,
              origem: "catalogo",
              favorito: true,
            },
          },
          {
            votos: 18,
            percentual: 100,
            candidato: {
              id: "df-paulo",
              numero: "2211",
              nome: "Paulo Serra",
              cargo: "Deputado Federal",
              foto_url: null,
              origem: "bu",
              favorito: false,
            },
          },
          {
            votos: 0,
            percentual: 0,
            candidato: {
              id: "df-zero",
              numero: "4444",
              nome: "Catálogo zerado",
              cargo: "Deputado Federal",
              foto_url: null,
              origem: "catalogo",
              favorito: true,
            },
          },
        ],
      },
    ];

    const todos = filterChefeRankingRows(groups, {
      cargoFilter: "Deputado Federal",
      sort: "votos",
      query: "",
      favoritoFilter: "todos",
    });
    const fav = filterChefeRankingRows(groups, {
      cargoFilter: "Deputado Federal",
      sort: "votos",
      query: "",
      favoritoFilter: "favoritos",
    });

    assert.equal(todos.length, 3);
    assert.equal(fav.length, 1);
    assert.equal(fav[0].candidato.numero, "1001");
    const keilaTodos = todos.find((r) => r.candidato.numero === "1001");
    assert.ok(keilaTodos);
    assert.equal(keilaTodos.percentual, percentualNoCargo(22, 110));
    assert.equal(fav[0].percentual, keilaTodos.percentual);
    assert.ok(Math.abs(fav[0].percentual - 20) < 0.01);
    assert.notEqual(fav[0].percentual, 100);
  });

  it("ignores 0-vote catalog rows in numerator and denominator", () => {
    assert.equal(percentualNoCargo(22, 110), percentualNoCargo(22, 110 + 0));
    assert.equal(percentualNoCargo(0, 110), 0);
  });
});

describe("chefeMiniaturaFallback", () => {
  it("uses initials or the urna number", () => {
    assert.equal(chefeMiniaturaFallback("Maria Silva", "13"), "MS");
    assert.equal(chefeMiniaturaFallback("Keila Giselle", "1001"), "KG");
    assert.equal(chefeMiniaturaFallback("Candidato 17", "17"), "17");
    assert.equal(chefeMiniaturaFallback("Candidato 99999", "99999"), "9999");
  });
});

describe("chefe ranking from boletins ⋈ candidatos", () => {
  it("Todos lists anyone with votes even when cargo is a TSE label", () => {
    const candidatos = [
      {
        id: "cat-1",
        numero: "1001",
        nome: "Keila",
        cargo: "DEPUTADO FEDERAL",
        foto_url: null,
        origem: "catalogo" as const,
        favorito: false,
      },
      {
        id: "bu-13",
        numero: "13",
        nome: "Maria Silva",
        cargo: "Governador",
        foto_url: null,
        origem: "cadastro" as const,
        favorito: false,
      },
      {
        id: "zero",
        numero: "9999",
        nome: "Sem voto",
        cargo: "Deputado Federal",
        foto_url: null,
        origem: "catalogo" as const,
        favorito: false,
      },
    ];
    const snap = buildDashboardSnapshot(
      [],
      candidatos,
      [
        {
          id: "b1",
          zona: "001",
          secao: "0001",
          candidato_id: "cat-1",
          quantidade_votos: 22,
          fiscal_nome: null,
          created_at: "2026-10-01T00:00:00Z",
        },
        {
          id: "b2",
          zona: "001",
          secao: "0001",
          candidato_id: "bu-13",
          quantidade_votos: 40,
          fiscal_nome: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
      {
        id: 1,
        secoes_esperadas: 1744,
        relatorio_cargos: ["todos"],
        zonas_config: [],
        updated_at: "2026-10-01T00:00:00Z",
      },
      "mock",
      "todos"
    );

    const rows = filterChefeRankingRows(snap.rankingGeralByCargo, {
      cargoFilter: "todos",
      sort: "votos",
      query: "",
      favoritoFilter: "todos",
    });
    assert.ok(rows.some((r) => r.candidato.id === "cat-1" && r.votos === 22));
    assert.ok(rows.some((r) => r.candidato.id === "bu-13" && r.votos === 40));
    assert.equal(
      rows.find((r) => r.candidato.id === "cat-1")?.cargo,
      "Deputado Federal"
    );
    assert.equal(
      rows.some((r) => r.candidato.id === "zero"),
      false
    );
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
