import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFeaturedCandidato, origemLabel } from "./cargos";
import {
  decodeChapadaBytes,
  keepByUf,
  mapTseCargo,
  parseChapadaPayload,
  situacaoKeep,
  summarizeChapadaParse,
} from "./chapada";
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
    assert.equal(parsed.format, "simplificado");
    assert.deepEqual(parsed.rows[0], {
      numero: "1001",
      nome: "Keila Giselle",
      cargo: "Deputado Federal",
    });
    assert.equal(parsed.rows[1].cargo, "Presidente");
    assert.equal(parsed.rows[1].numero, "13");
  });

  it("parses TSE consulta_cand semicolon + quotes and maps cargos", () => {
    const csv = `"SG_UF";"DS_CARGO";"SQ_CANDIDATO";"NR_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"DS_SITUACAO_CANDIDATURA";"DS_DETALHE_SITUACAO_CAND"
"SP";"DEPUTADO ESTADUAL";"250000111111";"10001";"JACIARA PATRICIA SILVA";"JACIARA PATRICIA";"APTO";"DEFERIDO"
"SP";"DEPUTADO FEDERAL";"250000222222";"1001";"KEILA GISELLE SOUZA";"KEILA GISELLE";"APTO";"DEFERIDO"
"SP";"SENADOR";"250000333333";"130";"GUSTAVO GIL";"GUSTAVO GIL";"APTO";"DEFERIDO"
"SP";"GOVERNADOR";"250000444444";"10";"RICARDO EDUARDO";"RICARDO EDUARDO";"APTO";"DEFERIDO"
"BR";"PRESIDENTE";"250000555555";"13";"LEONARDO MATIAS";"LEONARDO MATIAS";"APTO";"DEFERIDO"
"SP";"VICE-GOVERNADOR";"250000666666";"10";"FULANO VICE";"VICE FULANO";"APTO";"DEFERIDO"
"SP";"1º SUPLENTE";"250000777777";"130";"SUPLENTE UM";"SUPLENTE";"APTO";"DEFERIDO"
"RJ";"DEPUTADO ESTADUAL";"250000888888";"11111";"OUTRO ESTADO";"OUTRO UF";"APTO";"DEFERIDO"
"SP";"DEPUTADO ESTADUAL";"250000999999";"10002";"INAPTO EXEMPLO";"INAPTO EXEMPLO";"INAPTO";"INDEFERIDO"
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.format, "tse");
    assert.equal(parsed.rows.length, 5);
    assert.equal(parsed.skipped.cargo, 2);
    assert.equal(parsed.skipped.uf, 1);
    assert.equal(parsed.skipped.situacao, 1);
    const jaciara = parsed.rows.find((r) => r.numero === "10001");
    assert.equal(jaciara?.cargo, "Deputado Estadual");
    assert.equal(jaciara?.nome, "JACIARA PATRICIA");
    assert.equal(jaciara?.sq_candidato, "250000111111");
    const pres = parsed.rows.find((r) => r.cargo === "Presidente");
    assert.equal(pres?.numero, "13");
    assert.ok(summarizeChapadaParse(parsed).includes("5 importado"));
  });

  it("uses NM_CANDIDATO when urna name is empty and keeps Presidente with empty UF", () => {
    const csv = `NR_CANDIDATO,NM_CANDIDATO,NM_URNA_CANDIDATO,DS_CARGO,SG_UF,SQ_CANDIDATO
13,FULANO DA SILVA,,PRESIDENTE,,250000000013
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.format, "tse");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].nome, "FULANO DA SILVA");
    assert.equal(parsed.rows[0].cargo, "Presidente");
  });

  it("decodes latin1 TSE bytes", () => {
    const header =
      "NR_CANDIDATO;NM_URNA_CANDIDATO;DS_CARGO;SG_UF;SQ_CANDIDATO\n";
    const line = "1001;JOSÉ DA SILVA;DEPUTADO FEDERAL;SP;250000123456\n";
    const bytes = Uint8Array.from(Buffer.from(header + line, "latin1"));
    const text = decodeChapadaBytes(bytes);
    assert.ok(text.includes("JOSÉ"));
    const parsed = parseChapadaPayload(text);
    assert.equal(parsed.rows[0]?.nome, "JOSÉ DA SILVA");
  });
});

describe("tse cargo and uf helpers", () => {
  it("skips vice/suplente/prefeito", () => {
    assert.equal(mapTseCargo("VICE-GOVERNADOR"), null);
    assert.equal(mapTseCargo("VICE-PRESIDENTE"), null);
    assert.equal(mapTseCargo("1º SUPLENTE"), null);
    assert.equal(mapTseCargo("PREFEITO"), null);
    assert.equal(mapTseCargo("VEREADOR"), null);
    assert.equal(mapTseCargo("DEPUTADO ESTADUAL"), "Deputado Estadual");
    assert.equal(mapTseCargo("GOVERNADOR"), "Governador");
  });

  it("keeps SP state offices and Presidente on BR/empty", () => {
    assert.equal(keepByUf("SP", "Deputado Estadual"), true);
    assert.equal(keepByUf("BR", "Deputado Estadual"), false);
    assert.equal(keepByUf("BR", "Presidente"), true);
    assert.equal(keepByUf("", "Presidente"), true);
    assert.equal(keepByUf("RJ", "Senador"), false);
  });

  it("skips indeferido without matching deferido substring trap", () => {
    assert.equal(situacaoKeep("APTO", "DEFERIDO"), "keep");
    assert.equal(situacaoKeep("INAPTO", "INDEFERIDO"), "skip");
    assert.equal(situacaoKeep("", "INDEFERIDO COM RECURSO"), "skip");
    assert.equal(situacaoKeep("PENDENTE", "OUTRO"), "unknown");
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
