import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transmitBuCompleto } from "./data";
import {
  SANTO_ANDRE_ZONAS_FALLBACK,
  ZONA_FORA_DA_CIDADE,
  allowlistZonaKeys,
  isZonaAllowed,
  isZonaForaDaCidade,
  zonaAllowlistKey,
} from "./zona-allowlist";

describe("zona allowlist Santo André", () => {
  it("treats 383 and 0383 as the same zona", () => {
    assert.equal(zonaAllowlistKey("383"), "383");
    assert.equal(zonaAllowlistKey("0383"), "383");
    assert.equal(zonaAllowlistKey(" 0383 "), "383");
    assert.equal(isZonaAllowed("0383", SANTO_ANDRE_ZONAS_FALLBACK), true);
    assert.equal(isZonaAllowed("383", SANTO_ANDRE_ZONAS_FALLBACK), true);
  });

  it("accepts any seção in an allowed zona (gaps / 401 in 383)", () => {
    assert.equal(isZonaAllowed("383", SANTO_ANDRE_ZONAS_FALLBACK), true);
    assert.equal(isZonaForaDaCidade("383", SANTO_ANDRE_ZONAS_FALLBACK), false);
  });

  it("rejects a zona that is not on the list", () => {
    assert.equal(isZonaAllowed("247", SANTO_ANDRE_ZONAS_FALLBACK), false);
    assert.equal(isZonaForaDaCidade("247", SANTO_ANDRE_ZONAS_FALLBACK), true);
    assert.equal(ZONA_FORA_DA_CIDADE, "Zona não é de Santo André");
  });

  it("uses cadastro zonas_config when present, not the hardcoded fallback", () => {
    const keys = allowlistZonaKeys([{ zona: "010", secoes: 2 }]);
    assert.deepEqual(keys, ["10"]);
    assert.equal(isZonaAllowed("10", [{ zona: "010", secoes: 2 }]), true);
    assert.equal(isZonaAllowed("383", [{ zona: "010", secoes: 2 }]), false);
  });

  it("falls back to the 6 Santo André zones when config is empty", () => {
    const keys = allowlistZonaKeys([]);
    assert.deepEqual(keys.sort(), ["156", "263", "264", "306", "307", "383"].sort());
    assert.equal(isZonaAllowed("156", null), true);
    assert.equal(isZonaAllowed("001", []), false);
  });

  it("does not treat an unknown zona as fora until digits exist", () => {
    assert.equal(isZonaForaDaCidade("", SANTO_ANDRE_ZONAS_FALLBACK), false);
    assert.equal(isZonaForaDaCidade("   ", []), false);
  });

  it("fallback counts sum to 1744", () => {
    const sum = SANTO_ANDRE_ZONAS_FALLBACK.reduce((s, z) => s + z.secoes, 0);
    assert.equal(sum, 1744);
    assert.equal(SANTO_ANDRE_ZONAS_FALLBACK.length, 6);
  });

  it("transmitBuCompleto accepts 0383 / seção 401 (gaps, not sequential)", async () => {
    const result = await transmitBuCompleto({
      zona: "0383",
      secao: "0401",
      rawText: "TEST-383-401",
      votes: [
        {
          numero: "13",
          nome: "Teste",
          cargo: "Governador",
          quantidade: 3,
        },
      ],
    });
    assert.equal(result.ok, true);
  });

  it("transmitBuCompleto refuses a zona outside the allowlist", async () => {
    await assert.rejects(
      () =>
        transmitBuCompleto({
          zona: "247",
          secao: "0401",
          rawText: "TEST-FORA",
          votes: [
            {
              numero: "13",
              nome: "Teste",
              cargo: "Governador",
              quantidade: 1,
            },
          ],
        }),
      /Zona não é de Santo André/
    );
  });
});
