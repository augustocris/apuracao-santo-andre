import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cargoRowsForChefe,
  chefeGreeting,
  chefeMiniaturaFallback,
  filterChefeRankingRows,
  leftoverAfterPair,
  overlayChefeFavoritos,
  pinChefeHighlights,
  chefePinFotoStatusFromCandidatos,
  CHEFE_PINNED_GOVERNADORES,
  CHEFE_PINNED_PRESIDENTES,
  sortChefeFavoritesFirst,
  mobileChefeCargoRows,
  orderChefeMobileCargos,
  toggleChefeColumnSort,
} from "./chefe-ranking";
import { percentualNoCargo } from "./utils";
import {
  buildDashboardSnapshot,
  createChefe,
  listChefeFavoritoIds,
  listChefes,
  setChefeFavorito,
  transmitBuCompleto,
  unlockChefeByPin,
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

describe("chefes por PIN", () => {
  it("unlocks andre2026 as Cristiano and isolates favoritos between PINs", async () => {
    upsertMockCandidatos([
      {
        numero: "88888",
        nome: "Catalogo Fav",
        cargo: "Deputado Estadual",
        foto_url: null,
        origem: "catalogo",
        favorito: true,
      },
    ]);
    const cadastro = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    const bu = getMockCandidatos().find((c) => c.numero === "99999");
    const catalogo = getMockCandidatos().find((c) => c.numero === "88888");
    assert.ok(cadastro && bu && catalogo);

    const cristiano = await unlockChefeByPin("andre2026");
    assert.ok(cristiano);
    assert.equal(cristiano.nome, "Cristiano");
    assert.equal(cristiano.pin, "andre2026");
    assert.equal(await unlockChefeByPin("pin-errado"), null);

    await setChefeFavorito(cristiano.id, cadastro.id, true);
    await setChefeFavorito(cristiano.id, bu.id, true);
    await setChefeFavorito(cristiano.id, catalogo.id, true);

    const segundo = await createChefe({
      nome: "Maria",
      pin: "maria-teste-2026",
    });
    await setChefeFavorito(segundo.id, cadastro.id, true);

    const idsCristiano = await listChefeFavoritoIds(cristiano.id);
    const idsMaria = await listChefeFavoritoIds(segundo.id);
    assert.equal(idsCristiano.length, 3);
    assert.ok(idsCristiano.includes(cadastro.id));
    assert.ok(idsCristiano.includes(bu.id));
    assert.ok(idsCristiano.includes(catalogo.id));
    assert.deepEqual(idsMaria.sort(), [cadastro.id].sort());

    const globalStillUnused = getMockCandidatos().find(
      (x) => x.id === catalogo.id
    );
    assert.equal(globalStillUnused?.favorito, true);

    const nomes = (await listChefes()).map((c) => c.nome);
    assert.ok(nomes.includes("Cristiano"));
    assert.ok(nomes.includes("Maria"));
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

  it("Somente favoritos uses PIN ids, never candidatos.favorito", () => {
    const pinFav = filterChefeRankingRows(groups, {
      cargoFilter: "todos",
      sort: "votos",
      query: "",
      favoritoFilter: "favoritos",
      favoritoIds: new Set(["de-2"]),
    });
    assert.equal(pinFav.length, 1);
    assert.equal(pinFav[0].candidato.id, "de-2");
    assert.equal(pinFav[0].candidato.favorito, false);

    const overlaid = overlayChefeFavoritos(groups, new Set(["de-2"]));
    assert.equal(
      overlaid[0].rankings.find((r) => r.candidato.id === "de-2")?.candidato
        .favorito,
      true
    );
    assert.equal(
      overlaid[0].rankings.find((r) => r.candidato.id === "de-1")?.candidato
        .favorito,
      false
    );

    const todosA = filterChefeRankingRows(groups, {
      cargoFilter: "todos",
      sort: "votos",
      query: "",
      favoritoFilter: "todos",
      favoritoIds: new Set(["de-1"]),
    });
    const todosB = filterChefeRankingRows(groups, {
      cargoFilter: "todos",
      sort: "votos",
      query: "",
      favoritoFilter: "todos",
      favoritoIds: new Set(["de-2", "pr-1"]),
    });
    assert.deepEqual(
      todosA.map((r) => r.candidato.id),
      todosB.map((r) => r.candidato.id)
    );
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

describe("chefeGreeting", () => {
  it("uses local hour and the session name", () => {
    assert.equal(chefeGreeting(8, "Gilvan"), "Bom dia, Gilvan");
    assert.equal(chefeGreeting(15, "Gilvan"), "Boa tarde, Gilvan");
    assert.equal(chefeGreeting(21, "Cristiano"), "Boa noite, Cristiano");
    assert.equal(chefeGreeting(3, "Gilvan"), "Boa noite, Gilvan");
  });
});

describe("pinChefeHighlights", () => {
  it("pins governor 10 and 13 by cargo+number and ignores the rest", () => {
    const rows = cargoRowsForChefe(
      [
        {
          cargo: "Governador",
          totalVotos: 215,
          rankings: [
            {
              votos: 80,
              percentual: 0,
              candidato: {
                id: "g-other",
                numero: "45",
                nome: "Carlos Machado",
                cargo: "Governador",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 40,
              percentual: 0,
              candidato: {
                id: "g-13",
                numero: "13",
                nome: "Fernando Haddad",
                cargo: "Governador",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 95,
              percentual: 0,
              candidato: {
                id: "g-10",
                numero: "10",
                nome: "Tarcísio de Freitas",
                cargo: "Governador",
                foto_url: null,
                origem: "catalogo",
              },
            },
          ],
        },
      ],
      "Governador"
    );
    const pair = pinChefeHighlights(rows, CHEFE_PINNED_GOVERNADORES);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].candidato.numero, "10");
    assert.equal(pair[1].candidato.numero, "13");
    assert.equal(
      pair.some((r) => r.candidato.nome === "Carlos Machado"),
      false
    );
    pair[0].votos = 10;
    pair[1].votos = 200;
    const flipped = pinChefeHighlights(rows, CHEFE_PINNED_GOVERNADORES);
    assert.equal(flipped[0].candidato.nome, "Fernando Haddad");
    assert.equal(flipped[1].candidato.nome, "Tarcísio de Freitas");
  });

  it("falls back to governor name when the number is missing", () => {
    const rows = cargoRowsForChefe(
      [
        {
          cargo: "Governador",
          totalVotos: 10,
          rankings: [
            {
              votos: 10,
              percentual: 0,
              candidato: {
                id: "g-name",
                numero: "99",
                nome: "Tarcísio de Freitas",
                cargo: "Governador",
                foto_url: null,
                origem: "catalogo",
              },
            },
          ],
        },
      ],
      "Governador"
    );
    const pair = pinChefeHighlights(rows, CHEFE_PINNED_GOVERNADORES);
    assert.equal(pair.length, 2);
    assert.ok(pair.some((r) => r.candidato.id === "g-name"));
    assert.ok(pair.some((r) => r.candidato.nome === "Fernando Haddad"));
    assert.ok(pair.some((r) => r.candidato.id.startsWith("pin:")));
  });

  it("pins Lula and Flávio by folded urna name and uses numero+cargo", () => {
    const rows = cargoRowsForChefe(
      [
        {
          cargo: "Presidente",
          totalVotos: 30,
          rankings: [
            {
              votos: 12,
              percentual: 0,
              candidato: {
                id: "p-other",
                numero: "15",
                nome: "Clariana",
                cargo: "Presidente",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 8,
              percentual: 0,
              candidato: {
                id: "p-lula",
                numero: "13",
                nome: "LULA",
                cargo: "Presidente",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 10,
              percentual: 0,
              candidato: {
                id: "p-flavio",
                numero: "22",
                nome: "FLÁVIO",
                cargo: "Presidente",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 0,
              percentual: 0,
              candidato: {
                id: "p-edmilson",
                numero: "50",
                nome: "Edmilson",
                cargo: "Presidente",
                foto_url: null,
                origem: "catalogo",
              },
            },
          ],
        },
      ],
      "Presidente"
    );
    const pair = pinChefeHighlights(rows, CHEFE_PINNED_PRESIDENTES);
    assert.equal(pair.length, 2);
    const nomes = pair.map((r) => r.candidato.nome).sort();
    assert.deepEqual(nomes, ["FLÁVIO", "LULA"]);
    assert.ok(pair.some((r) => r.candidato.numero === "13"));
    assert.ok(pair.some((r) => r.candidato.numero === "22"));
    assert.equal(
      pair.some((r) => /clariana|edmilson/i.test(r.candidato.nome)),
      false
    );
  });

  it("synthesizes 0-vote slots when the catalog has nobody", () => {
    const pair = pinChefeHighlights([], CHEFE_PINNED_PRESIDENTES);
    assert.equal(pair.length, 2);
    assert.deepEqual(
      pair.map((r) => r.candidato.nome).sort(),
      ["Flávio", "Lula"]
    );
    assert.ok(pair.every((r) => r.votos === 0));
    assert.ok(pair.every((r) => r.candidato.id.startsWith("pin:")));
  });
});

describe("chefePinFotoStatus", () => {
  it("reports foto_url of the four pins without inventing images", () => {
    const status = chefePinFotoStatusFromCandidatos([
      {
        id: "g10",
        numero: "10",
        nome: "Tarcísio de Freitas",
        cargo: "Governador",
        foto_url: "https://cdn.example/tarcisio.jpg",
        sq_candidato: "1",
        origem: "cadastro",
      },
      {
        id: "g13",
        numero: "13",
        nome: "Fernando Haddad",
        cargo: "Governador",
        foto_url: null,
        sq_candidato: "2",
        origem: "catalogo",
      },
      {
        id: "p13",
        numero: "13",
        nome: "LULA",
        cargo: "Presidente",
        foto_url: null,
        origem: "catalogo",
      },
      {
        id: "p22",
        numero: "22",
        nome: "FLÁVIO BOLSONARO",
        cargo: "Presidente",
        foto_url: null,
        origem: "catalogo",
      },
    ]);
    assert.equal(status.length, 4);
    const tarcisio = status.find((p) => p.specLabel === "Tarcísio");
    const haddad = status.find((p) => p.specLabel === "Fernando Haddad");
    const lula = status.find((p) => p.specLabel === "Lula");
    const flavio = status.find((p) => p.specLabel === "Flávio");
    assert.equal(tarcisio?.foto_url, "https://cdn.example/tarcisio.jpg");
    assert.equal(haddad?.foto_url, null);
    assert.equal(lula?.nome, "LULA");
    assert.equal(flavio?.nome, "FLÁVIO BOLSONARO");
    assert.equal(haddad?.found, true);
  });
});

describe("sortChefeFavoritesFirst", () => {
  it("keeps PIN favorites on top without hiding the rest", () => {
    const rows = cargoRowsForChefe(
      [
        {
          cargo: "Deputado Estadual",
          totalVotos: 30,
          rankings: [
            {
              votos: 20,
              percentual: 0,
              candidato: {
                id: "de-1",
                numero: "13131",
                nome: "Roberto",
                cargo: "Deputado Estadual",
                foto_url: null,
                origem: "cadastro",
              },
            },
            {
              votos: 10,
              percentual: 0,
              candidato: {
                id: "de-2",
                numero: "99999",
                nome: "Outro",
                cargo: "Deputado Estadual",
                foto_url: null,
                origem: "bu",
              },
            },
            {
              votos: 0,
              percentual: 0,
              candidato: {
                id: "de-fav",
                numero: "11111",
                nome: "Favorito zero",
                cargo: "Deputado Estadual",
                foto_url: null,
                origem: "catalogo",
              },
            },
          ],
        },
      ],
      "Deputado Estadual"
    );
    const sorted = sortChefeFavoritesFirst(rows, new Set(["de-fav"]));
    assert.equal(sorted[0].candidato.id, "de-fav");
    assert.equal(sorted.length, 3);
    assert.equal(sorted[1].candidato.id, "de-1");
    const rest = leftoverAfterPair(rows, sorted.slice(0, 2), new Set(["de-fav"]));
    assert.equal(rest.length, 1);
    assert.equal(rest[0].candidato.id, "de-2");
  });

  it("lists catalog rows with 0 votes before any BU", () => {
    const rows = cargoRowsForChefe(
      [
        {
          cargo: "Deputado Federal",
          totalVotos: 0,
          rankings: [
            {
              votos: 0,
              percentual: 0,
              candidato: {
                id: "df-cat",
                numero: "1001",
                nome: "Keila Giselle",
                cargo: "Deputado Federal",
                foto_url: null,
                origem: "catalogo",
              },
            },
            {
              votos: 0,
              percentual: 0,
              candidato: {
                id: "df-bu",
                numero: "2211",
                nome: "Candidato 2211",
                cargo: "Deputado Federal",
                foto_url: null,
                origem: "bu",
              },
            },
          ],
        },
      ],
      "Deputado Federal"
    );
    const listed = sortChefeFavoritesFirst(rows, new Set());
    assert.equal(listed.length, 1);
    assert.equal(listed[0].candidato.id, "df-cat");
    const named = sortChefeFavoritesFirst(rows, new Set(), {
      key: "nome",
      dir: "asc",
    });
    assert.equal(named[0].candidato.nome, "Keila Giselle");
  });

  it("toggles Nome A↔Z and Votos desc↔asc", () => {
    const fromVotes = toggleChefeColumnSort(
      { key: "votos", dir: "desc" },
      "nome"
    );
    assert.deepEqual(fromVotes, { key: "nome", dir: "asc" });
    assert.deepEqual(toggleChefeColumnSort(fromVotes, "nome"), {
      key: "nome",
      dir: "desc",
    });
    const backVotes = toggleChefeColumnSort(fromVotes, "votos");
    assert.deepEqual(backVotes, { key: "votos", dir: "desc" });
    assert.deepEqual(toggleChefeColumnSort(backVotes, "votos"), {
      key: "votos",
      dir: "asc",
    });
  });
});

describe("mobile chefe cargo filter", () => {
  it("puts the selected cargo first, then Estadual → Federal → Senador", () => {
    assert.deepEqual(orderChefeMobileCargos("todos"), [
      "Deputado Estadual",
      "Deputado Federal",
      "Senador",
    ]);
    assert.deepEqual(orderChefeMobileCargos("Deputado Estadual"), [
      "Deputado Estadual",
      "Deputado Federal",
      "Senador",
    ]);
    assert.deepEqual(orderChefeMobileCargos("Deputado Federal"), [
      "Deputado Federal",
      "Deputado Estadual",
      "Senador",
    ]);
    assert.deepEqual(orderChefeMobileCargos("Senador"), [
      "Senador",
      "Deputado Estadual",
      "Deputado Federal",
    ]);
  });

  it("lists PIN favorites then top 10 by votes without repeating", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      votos: 14 - i,
      percentual: 0,
      cargo: "Deputado Estadual",
      candidato: {
        id: `de-${i}`,
        numero: String(10000 + i),
        nome: `Cand ${i}`,
        cargo: "Deputado Estadual",
        foto_url: null,
        origem: "catalogo" as const,
      },
    }));
    const listed = mobileChefeCargoRows(rows, new Set(["de-12"]));
    assert.equal(listed[0].candidato.id, "de-12");
    assert.equal(listed.length, 11);
    assert.ok(listed.slice(1).every((r) => r.candidato.id !== "de-12"));
    assert.equal(listed[1].candidato.id, "de-0");
    assert.equal(listed[10].candidato.id, "de-9");
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
    const zona = "383";
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
