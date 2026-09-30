import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchFeaturedCandidato, resolveBuVotes, transmitBuCompleto } from "./data";
import { getMockBoletins, getMockCandidatos } from "./mock-store";
import { parseBuQrText } from "./parser/bu-qr";

/** Printed simulado: governor nominais 0000, president 10 = 1. */
const PRES_ONLY_PRINTED = `
Zona Eleitoral: 0001
Secao Eleitoral: 0806
--------------GOVERNADOR-------------
Nome do candidato
Num cand Votos
Total de votos Nominais 0000
Brancos 0000
Nulos 0000
--------------PRESIDENTE-------------
Nome do candidato
Num cand Votos
LEONARDO MATIAS
10 0001
`;

const PRES_ONLY_TSE_QR = `QRBU:1:1 ZONA:1 SECA:806 CARG:3 TIPO:0 NOMI:0 BRAN:0 NULO:0 TOTC:0 CARG:1 TIPO:0 10:1 NOMI:1 BRAN:0 NULO:0 TOTC:1`;

describe("Presidente 10 ≠ Governador 10 (Tarcísio)", () => {
  it("printed BU: only President 10, no governor votes", () => {
    const parsed = parseBuQrText(PRES_ONLY_PRINTED);
    assert.equal(parsed.zona, "001");
    assert.equal(parsed.secao, "0806");
    const gov10 = parsed.votes.find(
      (v) => v.numero === "10" && v.cargo === "Governador"
    );
    const pres10 = parsed.votes.find(
      (v) => v.numero === "10" && v.cargo === "Presidente"
    );
    assert.equal(gov10, undefined);
    assert.equal(pres10?.quantidade, 1);
    assert.match(pres10?.nome ?? "", /LEONARDO/i);
  });

  it("TSE QR CARG:1 tags 10 as Presidente not Governador", () => {
    const parsed = parseBuQrText(PRES_ONLY_TSE_QR);
    assert.equal(parsed.secao, "0806");
    assert.equal(
      parsed.votes.find((v) => v.numero === "10" && v.cargo === "Presidente")
        ?.quantidade,
      1
    );
    assert.equal(
      parsed.votes.find((v) => v.numero === "10" && v.cargo === "Governador"),
      undefined
    );
  });

  it("2-digit without CARG/banner is Indefinido, not Governador", () => {
    const parsed = parseBuQrText(`ZONA:1 SECA:806 10:1`);
    assert.equal(parsed.votes.find((v) => v.numero === "10")?.cargo, "Indefinido");
  });

  it("does not match featured Governor 10 by numero alone", () => {
    const tarcisio = getMockCandidatos().find(
      (c) => c.numero === "10" && c.cargo === "Governador"
    );
    assert.ok(tarcisio);
    assert.equal(
      matchFeaturedCandidato([tarcisio], "10", "Presidente"),
      undefined
    );
    assert.equal(
      matchFeaturedCandidato([tarcisio], "10", "Indefinido"),
      undefined
    );
    assert.equal(
      matchFeaturedCandidato([tarcisio], "10", "Outro"),
      undefined
    );
    assert.equal(
      matchFeaturedCandidato([tarcisio], "10", "Governador")?.nome,
      "Tarcísio de Freitas"
    );
  });

  it("resolveBuVotes: President 10 is discovered, Tarcísio stays off confirm", async () => {
    const parsed = parseBuQrText(PRES_ONLY_PRINTED);
    const resolved = await resolveBuVotes(parsed.votes);
    const featuredGov = resolved.featured.filter(
      (r) => r.candidato.cargo === "Governador"
    );
    assert.equal(featuredGov.length, 0);
    assert.equal(
      resolved.featured.find((r) => r.candidato.numero === "10"),
      undefined
    );
    const disc = resolved.discovered.find(
      (d) => d.numero === "10" && d.cargo === "Presidente"
    );
    assert.equal(disc?.quantidade, 1);
    assert.match(disc?.nome ?? "", /LEONARDO/i);
  });

  it("ingest stores Presidente 10, not Governador Tarcísio", async () => {
    const parsed = parseBuQrText(PRES_ONLY_PRINTED);
    const resolved = await resolveBuVotes(parsed.votes);
    const result = await transmitBuCompleto({
      zona: parsed.zona,
      secao: "0806",
      rawText: parsed.rawText,
      votes: [
        ...resolved.featured.map((r) => ({
          candidatoId: r.candidato.id,
          numero: r.candidato.numero,
          nome: r.candidato.nome,
          cargo: String(r.candidato.cargo),
          quantidade: r.quantidade,
        })),
        ...resolved.discovered,
      ],
    });
    assert.equal(result.ok, true);
    const tarcisio = getMockCandidatos().find(
      (c) => c.numero === "10" && c.cargo === "Governador"
    );
    const pres = getMockCandidatos().find(
      (c) => c.numero === "10" && c.cargo === "Presidente"
    );
    assert.ok(tarcisio);
    assert.ok(pres);
    const govVotes = getMockBoletins()
      .filter((b) => b.secao === "0806" && b.candidato_id === tarcisio.id)
      .reduce((s, b) => s + b.quantidade_votos, 0);
    const presVotes = getMockBoletins()
      .filter((b) => b.secao === "0806" && b.candidato_id === pres.id)
      .reduce((s, b) => s + b.quantidade_votos, 0);
    assert.equal(govVotes, 0);
    assert.equal(presVotes, 1);
  });
});
