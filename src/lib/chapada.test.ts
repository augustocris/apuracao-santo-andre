import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFeaturedCandidato, origemLabel } from "./cargos";
import { parseChapadaPayload } from "./chapada";
import { importCandidatos, transmitBuCompleto } from "./data";
import { getMockCandidatos, upsertMockCandidatos } from "./mock-store";

describe("origem catalogo vs cadastro", () => {
  it("keeps telão featured-only", () => {
    assert.equal(isFeaturedCandidato("cadastro"), true);
    assert.equal(isFeaturedCandidato(null), true);
    assert.equal(isFeaturedCandidato("catalogo"), false);
    assert.equal(isFeaturedCandidato("bu"), false);
    assert.equal(origemLabel("catalogo"), "catálogo");
  });
});

describe("parseChapadaPayload", () => {
  it("parses CSV numero,nome,cargo including Presidente", () => {
    const csv = `numero,nome,cargo
1001,Keila Giselle,Deputado Federal
13,Leonardo Matias,Presidente
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.rows.length, 2);
    assert.deepEqual(parsed.rows[0], {
      numero: "1001",
      nome: "Keila Giselle",
      cargo: "Deputado Federal",
    });
    assert.equal(parsed.rows[1].cargo, "Presidente");
    assert.equal(parsed.rows[1].numero, "13");
  });
});

describe("import chapada", () => {
  it("does not overwrite cadastro featured names", async () => {
    const featured = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    assert.ok(featured);
    const original = featured.nome;
    const result = await importCandidatos(
      [
        { numero: "13", nome: "OUTRO NOME", cargo: "Governador" },
        { numero: "1001", nome: "Keila Giselle", cargo: "Deputado Federal" },
      ],
      { origem: "catalogo" }
    );
    assert.ok(result.skippedCadastro >= 1);
    const still = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    assert.equal(still?.nome, original);
    assert.equal(still?.origem, "cadastro");
    const keila = getMockCandidatos().find(
      (c) => c.numero === "1001" && c.cargo === "Deputado Federal"
    );
    assert.equal(keila?.nome, "Keila Giselle");
    assert.equal(keila?.origem, "catalogo");
  });
});

describe("ingest keeps catalog nome", () => {
  it("does not replace catalog name with Candidato {n}", async () => {
    upsertMockCandidatos([
      {
        numero: "45045",
        nome: "Ana Carolina Serra",
        cargo: "Deputado Estadual",
        foto_url: null,
        origem: "catalogo",
      },
    ]);
    const result = await transmitBuCompleto({
      zona: "077",
      secao: "0088",
      rawText: "TEST-CATALOGO",
      votes: [
        {
          numero: "45045",
          nome: "Candidato 45045",
          cargo: "Deputado Estadual",
          quantidade: 7,
        },
      ],
    });
    assert.equal(result.ok, true);
    const row = getMockCandidatos().find(
      (c) => c.numero === "45045" && c.cargo === "Deputado Estadual"
    );
    assert.equal(row?.nome, "Ana Carolina Serra");
    assert.equal(row?.origem, "catalogo");
  });
});
