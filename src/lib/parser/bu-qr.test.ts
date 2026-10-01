import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  inferCargoFromNumero,
  resolveVoteCargo,
} from "../cargos";
import {
  SAMPLE_BU_TEXT,
  SAMPLE_TSE_QR_PART1,
  SAMPLE_TSE_QR_PART2,
  SAMPLE_TSE_QR_TEXT,
  assertQrSetReadyToIngest,
  decodeBuPayloadStrategies,
  looksBinaryPayload,
  inheritQrZonaSecao,
  isQrSetComplete,
  mergeParsedBus,
  normalizeCandidateNumero,
  normalizeSecao,
  normalizeZona,
  parseBuQrText,
  parseComparecimento,
  parseFiscalQrChunk,
  parseQrbuMeta,
  SameQrRepeatError,
  extractBuVotes,
  sameQrPayload,
} from "./bu-qr";
import { normalizePrintedBuText } from "./ocr-bu";

const TSE_SIMULADO = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/tse-bu-simulado.txt"),
  "utf8"
);

describe("normalizeCandidateNumero", () => {
  it("strips leading zeros", () => {
    assert.equal(normalizeCandidateNumero("0017"), "17");
    assert.equal(normalizeCandidateNumero("17"), "17");
    assert.equal(normalizeCandidateNumero("4545"), "4545");
    assert.equal(normalizeCandidateNumero("04545"), "4545");
  });
});

describe("inferCargoFromNumero", () => {
  it("maps digit length without assuming Presidente vs Governador", () => {
    assert.equal(inferCargoFromNumero("13"), "Indefinido");
    assert.equal(inferCargoFromNumero("131"), "Senador");
    assert.equal(inferCargoFromNumero("1313"), "Deputado Federal");
    assert.equal(inferCargoFromNumero("13131"), "Deputado Estadual");
    assert.equal(inferCargoFromNumero("1"), "Outro");
    assert.equal(inferCargoFromNumero("123456"), "Outro");
  });

  it("keeps known cargo from headers instead of digit inference", () => {
    assert.equal(resolveVoteCargo("13", "Presidente"), "Presidente");
    assert.equal(resolveVoteCargo("13", "Governador"), "Governador");
    assert.equal(resolveVoteCargo("13", undefined), "Indefinido");
    assert.equal(resolveVoteCargo("4545", undefined), "Indefinido");
    assert.equal(resolveVoteCargo("13131", undefined), "Indefinido");
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
        cargo: "Indefinido",
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
        cargo: "Indefinido",
      },
    ]);
  });

  it("does not treat 2-digit numbers as Governador when CARG is absent", () => {
    const text = `ZONA:9 SECA:31 13:100 456:40 1313:22 45045:7 99:3`;
    const parsed = parseBuQrText(text);
    const cargoOf = (n: string) =>
      parsed.votes.find((v) => v.numero === n)?.cargo;
    assert.equal(cargoOf("13"), "Indefinido");
    assert.equal(cargoOf("99"), "Indefinido");
    assert.equal(cargoOf("456"), "Indefinido");
    assert.equal(cargoOf("1313"), "Indefinido");
    assert.equal(cargoOf("45045"), "Indefinido");
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

  it("rejects binary-like payload without mentioning Digitar", () => {
    const binary = "\u0000".repeat(80);
    assert.equal(looksBinaryPayload(binary), true);
    assert.throws(
      () => parseBuQrText(binary),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /vazio|binário/i);
        assert.doesNotMatch(err.message, /Digitar/);
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

describe("parseBuQrText — cargo headers PRESIDENTE vs GOVERNADOR", () => {
  it("tags 2-digit numbers from bare section titles", () => {
    const text = `
ZONA:1
SECAO:2
PRESIDENTE
CAND:13 QTVO:80
GOVERNADOR
CAND:13 QTVO:142
`;
    const parsed = parseBuQrText(text);
    const pres = parsed.votes.find(
      (v) => v.numero === "13" && v.cargo === "Presidente"
    );
    const gov = parsed.votes.find(
      (v) => v.numero === "13" && v.cargo === "Governador"
    );
    assert.equal(pres?.quantidade, 80);
    assert.equal(gov?.quantidade, 142);
  });
});

describe("multi-QR merge", () => {
  it("parses QRBU index/total", () => {
    assert.deepEqual(parseQrbuMeta(SAMPLE_TSE_QR_PART1), { index: 1, total: 2 });
    assert.deepEqual(parseQrbuMeta(SAMPLE_TSE_QR_PART2), { index: 2, total: 2 });
  });

  it("unions complementary slices of the same urna", () => {
    const a = parseBuQrText(SAMPLE_TSE_QR_PART1);
    const b = parseBuQrText(SAMPLE_TSE_QR_PART2);
    const merged = mergeParsedBus([a, b]);
    assert.equal(merged.zona, "247");
    assert.equal(merged.secao, "0123");
    const by = Object.fromEntries(
      merged.votes.map((v) => [`${v.cargo}:${v.numero}`, v.quantidade])
    );
    assert.equal(by["Presidente:17"], 103);
    assert.equal(by["Presidente:13"], 89);
    assert.equal(by["Deputado Federal:4545"], 11);
    assert.equal(by["Governador:10"], 55);
  });

  it("last fragment wins on overlapping numero+cargo", () => {
    const a = parseBuQrText(`QRBU:1:2 ZONA:1 SECA:1 CARG:3 13:10`);
    const b = parseBuQrText(`QRBU:2:2 ZONA:1 SECA:1 CARG:3 13:99`);
    const merged = mergeParsedBus([a, b]);
    assert.equal(
      merged.votes.find((v) => v.numero === "13")?.quantidade,
      99
    );
  });

  it("reads comparecimento from COMP", () => {
    assert.equal(parseComparecimento(SAMPLE_TSE_QR_TEXT), 250);
    assert.equal(parseBuQrText(SAMPLE_TSE_QR_TEXT).comparecimento, 250);
  });

  it("accepts incomplete QR 1 de 2 even without votes", () => {
    const parsed = parseBuQrText("QRBU:1:2 ZONA:001 SECA:0477 ORIG:VOTA");
    assert.equal(parsed.zona, "001");
    assert.equal(parsed.secao, "0477");
    assert.equal(parsed.qrIndex, 1);
    assert.equal(parsed.qrTotal, 2);
    assert.equal(parsed.votes.length, 0);
  });

  it("does not ingest an incomplete 1 de 2 set", () => {
    const a = parseBuQrText(SAMPLE_TSE_QR_PART1);
    assert.throws(
      () => assertQrSetReadyToIngest([a]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /1 de 2/);
        assert.match(err.message, /N[aã]o envie ainda/);
        return true;
      }
    );
  });

  it("ingests only after both complementary QRs are present", () => {
    const a = parseBuQrText(SAMPLE_TSE_QR_PART1);
    const b = parseBuQrText(SAMPLE_TSE_QR_PART2);
    const merged = assertQrSetReadyToIngest([a, b]);
    assert.ok(merged.votes.length >= 4);
  });

  it("rejects a QR from another urna", () => {
    const a = parseBuQrText(SAMPLE_TSE_QR_PART1);
    const b = parseBuQrText(`ZONA:9 SECA:9 CARG:3 13:1`);
    assert.throws(
      () => mergeParsedBus([a, b]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /outra urna/i);
        return true;
      }
    );
  });

  it("inherits zona/seção from part 1 when TSE part 2 has only votes", () => {
    const a = parseBuQrText(`QRBU:1:2 ZONA:001 SECA:0477 CARG:1 13:10 17:8`);
    const b = parseBuQrText(`QRBU:2:2 CARG:6 4545:11 45045:7 CARG:3 10:55`);
    assert.equal(b.zona, "");
    assert.equal(b.secao, "");
    const inherited = inheritQrZonaSecao(b, a);
    assert.equal(inherited.zona, "001");
    assert.equal(inherited.secao, "0477");
    const merged = assertQrSetReadyToIngest([a, inherited]);
    assert.equal(merged.zona, "001");
    assert.equal(merged.secao, "0477");
    assert.equal(
      merged.votes.find((v) => v.numero === "4545")?.quantidade,
      11
    );
    assert.equal(merged.votes.find((v) => v.numero === "13")?.quantidade, 10);
    assert.throws(() => assertQrSetReadyToIngest([a]), /1 de 2/);
  });

  it("caps glued seção 04777 to 0477 and does not invent a 5-digit section", () => {
    assert.equal(normalizeSecao("04777"), "0477");
    assert.equal(normalizeSecao("0477"), "0477");
    assert.equal(normalizeZona("00117"), "001");
    const parsed = parseBuQrText("QRBU:1:2 ZONA:001 SECA:04777 ORIG:VOTA");
    assert.equal(parsed.secao, "0477");
    assert.equal(parsed.zona, "001");
  });

  it("reads SEQL:01/02 and ORQR:2 without QRBU", () => {
    assert.deepEqual(parseQrbuMeta("SEQL:01/02 ORQR:1 ZONA:001 SECA:0477"), {
      index: 1,
      total: 2,
    });
    assert.deepEqual(parseQrbuMeta("SEQL:02/02 ORQR:2 CARG:6 4545:11"), {
      index: 2,
      total: 2,
    });
    assert.deepEqual(parseQrbuMeta("ORQR:2 13:10"), { index: 2, total: 2 });
  });

  it("fiscal pipeline: SEQL 2/2 without zona inherits part 1 and merges", () => {
    const part1 = parseFiscalQrChunk(
      "SEQL:01/02 ORQR:1 HASH:ABC123 IDUE:99 ZONA:001 SECA:0477 CARG:1 13:10 17:8",
      []
    );
    assert.equal(part1.zona, "001");
    assert.equal(part1.secao, "0477");
    assert.equal(part1.urnaHash, "ABC123");
    assert.equal(isQrSetComplete([part1]), false);

    const part2 = parseFiscalQrChunk(
      "SEQL:02/02 ORQR:2 HASH:ABC123 IDUE:99 CARG:6 4545:11 CARG:3 10:55",
      [part1]
    );
    assert.equal(part2.zona, "001");
    assert.equal(part2.secao, "0477");
    assert.doesNotMatch(part2.rawText, /ZONA\s*:/i);

    const merged = assertQrSetReadyToIngest([part1, part2]);
    assert.equal(merged.zona, "001");
    assert.equal(merged.secao, "0477");
    assert.ok(merged.votes.some((v) => v.numero === "4545"));
    assert.ok(merged.votes.some((v) => v.numero === "13"));
    assert.throws(() => assertQrSetReadyToIngest([part1]), /1 de 2/);
  });

  it("does not require votes on SEQL 02/02 alone; concatenates then parses", () => {
    const part1 = parseFiscalQrChunk(
      "SEQL:01/02 ORQR:1 HASH:ZZ9 IDUE:77 ZONA:001 SECA:0477 CARG:1 13:10 17:8",
      []
    );
    const part2 = parseFiscalQrChunk(
      "SEQL:02/02 ORQR:2 HASH:ZZ9 IDUE:77 45455:11CARG:3 10:55",
      [part1]
    );
    assert.equal(part2.zona, "001");
    assert.equal(part2.secao, "0477");
    const merged = assertQrSetReadyToIngest([part1, part2]);
    assert.equal(
      merged.votes.find((v) => v.numero === "45455")?.quantidade,
      11
    );
    assert.equal(merged.votes.find((v) => v.numero === "13")?.quantidade, 10);
    assert.equal(merged.votes.find((v) => v.numero === "10")?.quantidade, 55);
  });

  it("accepts QR 2 with no isolatable votes and recovers them from the combined text", () => {
    const part1 = parseFiscalQrChunk(
      "SEQL:01/02 HASH:COMBO ZONA:001 SECA:0807 CARG:6 4545:11 45045:7",
      []
    );
    const part2 = parseFiscalQrChunk("SEQL:02/02 ORQR:2 HASH:COMBO", [part1]);
    assert.equal(part2.votes.length, 0);
    const merged = assertQrSetReadyToIngest([part1, part2]);
    assert.ok(merged.votes.some((v) => v.numero === "4545"));
    assert.ok(merged.votes.some((v) => v.numero === "45045"));
  });

  it("ignores a repeat of the exact part-1 payload", () => {
    const raw1 =
      "SEQL:01/02 HASH:SAME ZONA:001 SECA:0477 CARG:1 13:10 17:8";
    const part1 = parseFiscalQrChunk(raw1, []);
    assert.equal(sameQrPayload(part1.rawText, raw1), true);
    assert.throws(
      () => parseFiscalQrChunk(raw1, [part1]),
      (err: unknown) => err instanceof SameQrRepeatError
    );
  });

  it("reads denser glued pairs from the concatenation", () => {
    const votes = extractBuVotes(
      "SEQL:01/02 ZONA:1 SECA:1 CARG:7 45455:11HASH:ABC 45045:7"
    );
    assert.equal(votes.find((v) => v.numero === "45455")?.quantidade, 11);
    assert.equal(votes.find((v) => v.numero === "45045")?.quantidade, 7);
  });

  it("rejects QR 2 with a different HASH", () => {
    const part1 = parseFiscalQrChunk(
      "SEQL:01/02 HASH:AAA ZONA:001 SECA:0807 CARG:1 13:1",
      []
    );
    assert.throws(
      () =>
        parseFiscalQrChunk(
          "SEQL:02/02 HASH:BBB CARG:6 4545:2",
          [part1]
        ),
      /HASH diferente/
    );
  });
});

describe("TSE BU simulado (printed dump fixture)", () => {
  it("normalizes glued OCR labels", () => {
    const n = normalizePrintedBuText(
      "ZonaEleitoral 0001\nSec¸˜ aoEleitoral 0477\nDEPUTADOFEDERAL\n1de2"
    );
    assert.match(n, /Zona Eleitoral 0001/);
    assert.match(n, /Secao Eleitoral 0477/);
    assert.match(n, /DEPUTADO FEDERAL/);
    assert.match(n, /1 de 2/);
  });

  it("parses zona, seção, QR 1/2, cargos and skips party 10", () => {
    const parsed = parseBuQrText(TSE_SIMULADO);
    assert.equal(parsed.zona, "001");
    assert.equal(parsed.secao, "0477");
    assert.equal(parsed.qrIndex, 1);
    assert.equal(parsed.qrTotal, 2);

    const key = (v: { cargo: string; numero: string }) => `${v.cargo}:${v.numero}`;
    const by = Object.fromEntries(
      parsed.votes.map((v) => [key(v), v])
    );

    assert.equal(by["Deputado Federal:1001"]?.quantidade, 2);
    assert.match(by["Deputado Federal:1001"]?.nome ?? "", /KEILA/i);

    assert.equal(by["Deputado Estadual:10001"]?.quantidade, 2);
    assert.match(by["Deputado Estadual:10001"]?.nome ?? "", /JACIARA/i);
    assert.equal(by["Deputado Estadual:13001"]?.quantidade, 1);
    assert.match(by["Deputado Estadual:13001"]?.nome ?? "", /RITA/i);

    assert.equal(by["Senador:130"]?.quantidade, 1);
    assert.match(by["Senador:130"]?.nome ?? "", /GUSTAVO/i);
    assert.equal(by["Senador:140"]?.quantidade, 2);
    assert.match(by["Senador:140"]?.nome ?? "", /NUNO/i);

    assert.equal(by["Governador:10"]?.quantidade, 1);
    assert.equal(by["Governador:13"]?.quantidade, 1);
    assert.equal(by["Presidente:10"]?.quantidade, 1);
    assert.equal(by["Presidente:13"]?.quantidade, 1);
    assert.equal(by["Presidente:14"]?.quantidade, 1);

    const tens = parsed.votes.filter((v) => v.numero === "10");
    assert.equal(tens.length, 2);
    assert.deepEqual(
      tens.map((v) => v.cargo).sort(),
      ["Governador", "Presidente"]
    );
    assert.equal(
      parsed.votes.filter((v) => v.numero === "10" && v.cargo === "Indefinido")
        .length,
      0
    );

    assert.equal(parsed.votes.find((v) => v.numero === "20"), undefined);
    assert.equal(parsed.votes.find((v) => v.numero === "2488"), undefined);
    assert.equal(parsed.votes.find((v) => v.numero === "1392"), undefined);
    assert.equal(parsed.votes.find((v) => v.numero === "325"), undefined);

    assert.equal(parsed.votes.length, 10);
  });

  it("does not mix Presidente 13 with Governador 13", () => {
    const parsed = parseBuQrText(TSE_SIMULADO);
    const gov13 = parsed.votes.find(
      (v) => v.numero === "13" && v.cargo === "Governador"
    );
    const pres13 = parsed.votes.find(
      (v) => v.numero === "13" && v.cargo === "Presidente"
    );
    assert.equal(gov13?.quantidade, 1);
    assert.equal(pres13?.quantidade, 1);
  });
});

