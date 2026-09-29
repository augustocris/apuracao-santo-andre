import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferCargoFromNumero,
  resolveVoteCargo,
} from "../cargos";
import {
  SAMPLE_BU_TEXT,
  SAMPLE_TSE_QR_TEXT,
  decodeBuPayloadStrategies,
  looksBinaryPayload,
  normalizeCandidateNumero,
  parseBuQrText,
} from "./bu-qr";

describe("normalizeCandidateNumero", () => {
  it("strips leading zeros", () => {
    assert.equal(normalizeCandidateNumero("0017"), "17");
    assert.equal(normalizeCandidateNumero("17"), "17");
    assert.equal(normalizeCandidateNumero("4545"), "4545");
    assert.equal(normalizeCandidateNumero("04545"), "4545");
  });
});

describe("inferCargoFromNumero", () => {
  it("maps digit length to statewide cargos", () => {
    assert.equal(inferCargoFromNumero("13"), "Governador");
    assert.equal(inferCargoFromNumero("131"), "Senador");
    assert.equal(inferCargoFromNumero("1313"), "Deputado Federal");
    assert.equal(inferCargoFromNumero("13131"), "Deputado Estadual");
    assert.equal(inferCargoFromNumero("1"), "Outro");
    assert.equal(inferCargoFromNumero("123456"), "Outro");
  });

  it("keeps known cargo from headers instead of digit inference", () => {
    assert.equal(resolveVoteCargo("13", "Presidente"), "Presidente");
    assert.equal(resolveVoteCargo("13", undefined), "Governador");
  });
});

describe("parseBuQrText — CAND/QTVO demo format", () => {
  it("parses SAMPLE_BU_TEXT with all pairs and inferred cargos", () => {
    const parsed = parseBuQrText(SAMPLE_BU_TEXT);
    assert.equal(parsed.zona, "001");
    assert.equal(parsed.secao, "0001");
    assert.equal(parsed.votes.length, 7);
    const thirteen = parsed.votes.find((v) => v.numero === "13");
    assert.deepEqual(thirteen, {
      numero: "13",
      quantidade: 142,
      nome: "Candidato 13",
      cargo: "Governador",
    });
    assert.equal(
      parsed.votes.find((v) => v.numero === "13131")?.cargo,
      "Deputado Estadual"
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "1313")?.cargo,
      "Deputado Federal"
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "131")?.cargo,
      "Senador"
    );
  });

  it("parses CANDIDATO/VOTOS", () => {
    const text = `ZONA:88\nSECAO:12\nCANDIDATO:4545 VOTOS:11`;
    const parsed = parseBuQrText(text);
    assert.equal(parsed.zona, "088");
    assert.equal(parsed.secao, "0012");
    assert.deepEqual(parsed.votes, [
      {
        numero: "4545",
        quantidade: 11,
        nome: "Candidato 4545",
        cargo: "Deputado Federal",
      },
    ]);
  });
});

describe("parseBuQrText — official TSE QR (numero:votos)", () => {
  it("extracts ZONA/SECA and every candidate numeric pair", () => {
    const parsed = parseBuQrText(SAMPLE_TSE_QR_TEXT);
    assert.equal(parsed.zona, "247");
    assert.equal(parsed.secao, "0123");
    const byNum = Object.fromEntries(
      parsed.votes.map((v) => [v.numero, v.quantidade])
    );
    assert.equal(byNum["17"], 103);
    assert.equal(byNum["13"], 89);
    assert.equal(byNum["4545"], 11);
    assert.equal(byNum["45045"], 7);
    assert.equal(byNum["111"], 4);
    assert.equal(byNum["222"], 2);
    assert.equal(byNum["10"], 55);
    assert.equal(byNum["91"], undefined);
    assert.equal(byNum["1"], undefined);
    assert.ok(parsed.votes.length >= 8);
    assert.equal(
      parsed.votes.find((v) => v.numero === "17")?.nome,
      "Candidato 17"
    );
  });

  it("assigns cargo from CARG sections when present", () => {
    const parsed = parseBuQrText(SAMPLE_TSE_QR_TEXT);
    assert.equal(
      parsed.votes.find((v) => v.numero === "17")?.cargo,
      "Presidente"
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "4545")?.cargo,
      "Deputado Federal"
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "10")?.cargo,
      "Governador"
    );
  });

  it("filters to registered candidatos only", () => {
    const parsed = parseBuQrText(SAMPLE_TSE_QR_TEXT, {
      registeredNumeros: ["4545", "45045", "10"],
    });
    assert.equal(parsed.votes.length, 3);
    const nums = parsed.votes.map((v) => v.numero).sort();
    assert.deepEqual(nums, ["10", "45045", "4545"]);
    assert.equal(
      parsed.votes.find((v) => v.numero === "4545")?.quantidade,
      11
    );
  });

  it("matches padded registered numbers (0017 ↔ 17)", () => {
    const text = `ZONA:1 SECA:1 0017:0103 13:50`;
    const parsed = parseBuQrText(text, { registeredNumeros: ["17"] });
    assert.deepEqual(parsed.votes, [
      {
        numero: "17",
        quantidade: 103,
        nome: "Candidato 17",
        cargo: "Governador",
      },
    ]);
  });

  it("infers cargo from digit length when CARG is absent", () => {
    const text = `ZONA:9 SECA:31 13:100 456:40 1313:22 45045:7 99:3`;
    const parsed = parseBuQrText(text);
    const cargoOf = (n: string) =>
      parsed.votes.find((v) => v.numero === n)?.cargo;
    assert.equal(cargoOf("13"), "Governador");
    assert.equal(cargoOf("456"), "Senador");
    assert.equal(cargoOf("1313"), "Deputado Federal");
    assert.equal(cargoOf("45045"), "Deputado Estadual");
    assert.equal(parsed.votes.length, 5);
  });
});

describe("parseBuQrText — printed BU / tabular lines", () => {
  it("parses president + deputado sections like the paper BU", () => {
    const text = `
Zona Eleitoral: 0001
Seção Eleitoral: 0483
------------PRESIDENTE------------
Nome                    Num cand  Votos
JAIR BOLSONARO          17        0103
FERNANDO HADDAD         13        0089
------------DEPUTADO FEDERAL------------
PAULO SERRA             4545      0011
OUTRO CANDIDATO         9999      0002
------------DEPUTADO ESTADUAL------------
ANA CAROLINA SERRA      45045     0007
`;
    const parsed = parseBuQrText(text, {
      registeredNumeros: ["17", "4545", "45045"],
    });
    assert.equal(parsed.zona, "001");
    assert.equal(parsed.secao, "0483");
    assert.equal(parsed.votes.length, 3);
    assert.equal(
      parsed.votes.find((v) => v.numero === "17")?.quantidade,
      103
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "4545")?.quantidade,
      11
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "45045")?.quantidade,
      7
    );
  });

  it("extracts ALL pairs plus printed names and header cargos", () => {
    const text = `
Zona Eleitoral: 0001
Seção Eleitoral: 0483
------------PRESIDENTE------------
JAIR BOLSONARO          17        0103
FERNANDO HADDAD         13        0089
------------GOVERNADOR------------
MARIA SILVA             13        0142
------------DEPUTADO FEDERAL------------
PAULO SERRA             4545      0011
OUTRO CANDIDATO         9999      0002
------------DEPUTADO ESTADUAL------------
ANA CAROLINA SERRA      45045     0007
`;
    const parsed = parseBuQrText(text);
    assert.equal(parsed.votes.length, 6);
    const bolso = parsed.votes.find(
      (v) => v.numero === "17" && v.cargo === "Presidente"
    );
    assert.equal(bolso?.nome, "JAIR BOLSONARO");
    assert.equal(bolso?.quantidade, 103);
    const gov = parsed.votes.find(
      (v) => v.numero === "13" && v.cargo === "Governador"
    );
    assert.equal(gov?.nome, "MARIA SILVA");
    const extra = parsed.votes.find((v) => v.numero === "9999");
    assert.equal(extra?.nome, "OUTRO CANDIDATO");
    assert.equal(extra?.cargo, "Deputado Federal");
  });
});

describe("parseBuQrText — error messages PT-BR", () => {
  it("lists registered numbers when QR has votes but none match cadastro", () => {
    const text = `ZONA:1 SECA:1 99:10 88:20`;
    assert.throws(
      () => parseBuQrText(text, { registeredNumeros: ["4545", "10"] }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /QR lido, mas nenhum número cadastrado encontrado no boletim/
        );
        assert.match(err.message, /4545/);
        assert.match(err.message, /10/);
        assert.doesNotMatch(err.message, /Formato esperado: CAND/);
        return true;
      }
    );
  });

  it("guides Digitar when payload is binary-like", () => {
    const binary = "\u0000\u0001\u0002\u0003" + "xxxx".repeat(20);
    assert.equal(looksBinaryPayload(binary), true);
    assert.throws(
      () => parseBuQrText(binary),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /binário|Digitar/i);
        return true;
      }
    );
  });
});

describe("decodeBuPayloadStrategies", () => {
  it("keeps clean TSE text unchanged", () => {
    const out = decodeBuPayloadStrategies(SAMPLE_TSE_QR_TEXT);
    assert.match(out, /ZONA:247/);
    assert.match(out, /4545:11/);
  });
});
