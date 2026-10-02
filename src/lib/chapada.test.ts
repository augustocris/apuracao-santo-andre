import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFeaturedCandidato, origemLabel } from "./cargos";
import {
  decodeChapadaBytes,
  keepByUf,
  mapTseCargo,
  normalizeSqCandidato,
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
    assert.equal(pres?.sq_candidato, "250000555555");
    assert.ok(summarizeChapadaParse(parsed).includes("5 importado"));
  });

  it("imports Presidente from a BR-only consulta_cand file", () => {
    const csv = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
BR;PRESIDENTE;250000555555;13;LEONARDO MATIAS;APTO;DEFERIDO
BR;VICE-PRESIDENTE;250000555556;13;VICE NOME;APTO;DEFERIDO
BR;PRESIDENTE;250000555557;22;OUTRO PRES;APTO;DEFERIDO
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.format, "tse");
    assert.equal(parsed.skipped.uf, 0);
    assert.equal(parsed.skipped.cargo, 1);
    const presidents = parsed.rows.filter((r) => r.cargo === "Presidente");
    assert.equal(presidents.length, 2);
    assert.ok(
      presidents.some((r) => r.numero === "13" && r.sq_candidato === "250000555555")
    );
    assert.ok(presidents.some((r) => r.numero === "22"));
  });

  it("SP-only file without PRESIDENTE does not invent names; combined file upserts BR rows", () => {
    const spOnly = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
SP;DEPUTADO FEDERAL;250000222222;1001;KEILA GISELLE;APTO;DEFERIDO
SP;GOVERNADOR;250000444444;10;RICARDO EDUARDO;APTO;DEFERIDO
`;
    const sp = parseChapadaPayload(spOnly);
    assert.equal(sp.rows.length, 2);
    assert.equal(
      sp.rows.some((r) => r.cargo === "Presidente"),
      false
    );

    const brOnly = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
BR;PRESIDENTE;250000555555;13;LEONARDO MATIAS;APTO;DEFERIDO
`;
    const br = parseChapadaPayload(brOnly);
    assert.equal(br.rows.length, 1);
    assert.equal(br.rows[0].cargo, "Presidente");
    assert.equal(br.skipped.uf, 0);

    const combined = parseChapadaPayload(
      `${spOnly.trim()}\n${brOnly.split("\n").slice(1).join("\n")}`
    );
    assert.equal(combined.rows.length, 3);
    assert.equal(
      combined.rows.find((r) => r.cargo === "Presidente")?.nome,
      "LEONARDO MATIAS"
    );
    assert.equal(combined.skipped.uf, 0);
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

  it("dedupes padded NR_CANDIDATO (02739 vs 2739) and party-change rows", () => {
    const csv = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
SP;DEPUTADO FEDERAL;250000000001;02739;NOME ANTIGO;INAPTO;INDEFERIDO
SP;DEPUTADO FEDERAL;250000000002;2739;NOME NOVO;APTO;DEFERIDO
SP;DEPUTADO FEDERAL;250000000003;02739;NOME MEIO;APTO;DEFERIDO
SP;DEPUTADO ESTADUAL;250000000010;010001;ESTADUAL A;APTO;DEFERIDO
SP;DEPUTADO ESTADUAL;250000000011;10001;ESTADUAL B;APTO;DEFERIDO
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.format, "tse");
    const federais = parsed.rows.filter((r) => r.cargo === "Deputado Federal");
    assert.equal(federais.length, 1);
    assert.equal(federais[0].numero, "2739");
    assert.equal(federais[0].nome, "NOME MEIO");
    const estaduais = parsed.rows.filter((r) => r.cargo === "Deputado Estadual");
    assert.equal(estaduais.length, 1);
    assert.equal(estaduais[0].numero, "10001");
    assert.equal(estaduais[0].nome, "ESTADUAL B");
    assert.ok(parsed.skipped.duplicates >= 1);
    assert.ok(summarizeChapadaParse(parsed).includes("duplicata"));
  });

  it("prefers APTO when the same numero+cargo appears twice", () => {
    const csv = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
SP;SENADOR;1;130;PRIMEIRO;APTO;DEFERIDO
SP;SENADOR;2;130;SEGUNDO;PENDENTE;OUTRO
`;
    const parsed = parseChapadaPayload(csv);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].nome, "PRIMEIRO");
    assert.equal(parsed.skipped.duplicates, 1);
  });

  it("keeps SQ_CANDIDATO when Excel sends a number or scientific notation", () => {
    assert.equal(normalizeSqCandidato(250000252653), "250000252653");
    assert.equal(normalizeSqCandidato("250000252653"), "250000252653");
    assert.equal(normalizeSqCandidato("250000252653.0"), "250000252653");
    assert.equal(normalizeSqCandidato("2.50000252653E+11"), "250000252653");
    assert.equal(normalizeSqCandidato("2,50000252653E+11"), "250000252653");
    assert.equal(normalizeSqCandidato("#NULO#"), null);

    const csv = `SG_UF;DS_CARGO;SQ_CANDIDATO;NR_CANDIDATO;NM_URNA_CANDIDATO;DS_SITUACAO_CANDIDATURA;DS_DETALHE_SITUACAO_CAND
SP;DEPUTADO FEDERAL;2.50000252653E+11;1001;KEILA GISELLE;APTO;DEFERIDO
SP;GOVERNADOR;250000252653.0;13;FERNANDO HADDAD;APTO;DEFERIDO
`;
    const parsed = parseChapadaPayload(csv);
    const keila = parsed.rows.find((r) => r.numero === "1001");
    const haddad = parsed.rows.find((r) => r.numero === "13");
    assert.equal(keila?.sq_candidato, "250000252653");
    assert.equal(haddad?.sq_candidato, "250000252653");

    const json = parseChapadaPayload(
      JSON.stringify([
        {
          NR_CANDIDATO: 22,
          NM_URNA_CANDIDATO: "FLAVIO",
          DS_CARGO: "PRESIDENTE",
          SQ_CANDIDATO: 250000252653,
        },
      ])
    );
    assert.equal(json.rows[0]?.sq_candidato, "250000252653");
  });

  it("reads SQ_CANDIDATO from the header first, else column E (not G)", () => {
    const byHeader = parseChapadaPayload(
      `NR_CANDIDATO;NM_URNA_CANDIDATO;DS_CARGO;SG_UF;OUTRA;SQ_CANDIDATO
1001;KEILA;DEPUTADO FEDERAL;SP;IGNORAR;250000252653
`
    );
    assert.equal(byHeader.rows[0]?.sq_candidato, "250000252653");

    const byColE = parseChapadaPayload(
      `NR_CANDIDATO;NM_URNA_CANDIDATO;DS_CARGO;SG_UF;SQ_CANDIDATO
2739;NOME;DEPUTADO FEDERAL;SP;250000111111
`
    );
    assert.equal(byColE.rows[0]?.sq_candidato, "250000111111");

    const positionalE = parseChapadaPayload(
      `1001,Keila Giselle,Deputado Federal,SP,250000252653,colunaF,colunaG`
    );
    assert.equal(positionalE.rows[0]?.sq_candidato, "250000252653");
    assert.notEqual(positionalE.rows[0]?.sq_candidato, "colunaG");
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

  it("keeps SP state offices and Presidente on BR/empty/BRASIL", () => {
    assert.equal(keepByUf("SP", "Deputado Estadual"), true);
    assert.equal(keepByUf("BR", "Deputado Estadual"), false);
    assert.equal(keepByUf("BR", "Presidente"), true);
    assert.equal(keepByUf("BRASIL", "Presidente"), true);
    assert.equal(keepByUf("", "Presidente"), true);
    assert.equal(keepByUf("SP", "Presidente"), true);
    assert.equal(keepByUf("RJ", "Senador"), false);
    assert.equal(keepByUf("RJ", "Presidente"), false);
    assert.equal(keepByUf(undefined, "Presidente"), true);
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

  it("persists numeric SQ on catalog and does not wipe existing catalog foto", async () => {
    upsertMockCandidatos([
      {
        numero: "1001",
        nome: "Keila Giselle",
        cargo: "Deputado Federal",
        foto_url: "https://cdn.example/keila.jpg",
        origem: "catalogo",
      },
    ]);
    const featured = getMockCandidatos().find(
      (c) => c.numero === "10" && c.cargo === "Governador"
    );
    const featuredFoto = featured?.foto_url ?? null;
    const result = await importCandidatos(
      [
        {
          numero: "1001",
          nome: "Keila Giselle",
          cargo: "Deputado Federal",
          sq_candidato: 250000252653 as unknown as string,
        },
        {
          numero: "10",
          nome: "Tarcisio CSV",
          cargo: "Governador",
          sq_candidato: "250000111111",
        },
      ],
      { origem: "catalogo" }
    );
    assert.equal(result.sqPersisted, true);
    const keila = getMockCandidatos().find(
      (c) => c.numero === "1001" && c.cargo === "Deputado Federal"
    );
    assert.equal(keila?.sq_candidato, "250000252653");
    assert.equal(keila?.foto_url, "https://cdn.example/keila.jpg");
    const stillFeatured = getMockCandidatos().find(
      (c) => c.numero === "10" && c.cargo === "Governador"
    );
    assert.equal(stillFeatured?.origem, "cadastro");
    assert.equal(stillFeatured?.foto_url, featuredFoto);
    assert.notEqual(stillFeatured?.nome, "Tarcisio CSV");
  });

  it("unifies padded duplicates before upsert and reports count", async () => {
    const result = await importCandidatos(
      [
        { numero: "02739", nome: "A", cargo: "Deputado Federal" },
        { numero: "2739", nome: "B", cargo: "Deputado Federal" },
        { numero: "2739", nome: "C", cargo: "Deputado Federal" },
      ],
      { origem: "catalogo" }
    );
    assert.equal(result.duplicates, 2);
    const matches = getMockCandidatos().filter(
      (c) => c.numero === "2739" && c.cargo === "Deputado Federal"
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].nome, "C");
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
      zona: "383",
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
