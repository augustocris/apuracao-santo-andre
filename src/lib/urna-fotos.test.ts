import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zipSync } from "fflate";
import { applyCandidatoFotos } from "./data";
import { getMockCandidatos } from "./mock-store";
import {
  buildUrnaFotoIndex,
  isUrnaImagePath,
  listImagesFromZip,
  matchUrnaFotoFilename,
} from "./urna-fotos";

const index = buildUrnaFotoIndex([
  {
    numero: "10001",
    cargo: "Deputado Estadual",
    sq_candidato: "250000111111",
    origem: "catalogo",
    foto_url: null,
  },
  {
    numero: "13",
    cargo: "Presidente",
    sq_candidato: "250000555555",
    origem: "catalogo",
    foto_url: null,
  },
  {
    numero: "13",
    cargo: "Governador",
    origem: "cadastro",
    foto_url: "https://cdn.example/tarcisio.jpg",
  },
  {
    numero: "10",
    cargo: "Governador",
    origem: "cadastro",
    foto_url: null,
  },
]);

describe("urna photo filename matching", () => {
  it("matches SQ_CANDIDATO.jpg and nested paths", () => {
    const a = matchUrnaFotoFilename("250000111111.jpg", index);
    assert.ok(a && "target" in a);
    assert.equal(a.via, "sq");
    assert.equal(a.target.numero, "10001");

    const nested = matchUrnaFotoFilename("fotos/urna/250000555555.JPEG", index);
    assert.ok(nested && "target" in nested);
    assert.equal(nested.target.cargo, "Presidente");
  });

  it("matches NR_CANDIDATO when unique and flags ambiguous 13", () => {
    const unique = matchUrnaFotoFilename("10001.png", index);
    assert.ok(unique && "target" in unique);
    assert.equal(unique.via, "numero");

    const ambi = matchUrnaFotoFilename("13.jpg", index);
    assert.ok(ambi && "ambiguous" in ambi);

    const gov10 = matchUrnaFotoFilename("10.jpeg", index);
    assert.ok(gov10 && "target" in gov10);
    assert.equal(gov10.target.cargo, "Governador");
  });

  it("ignores macos junk and non-images", () => {
    assert.equal(isUrnaImagePath("__MACOSX/._250000111111.jpg"), false);
    assert.equal(isUrnaImagePath("notas.txt"), false);
    assert.equal(isUrnaImagePath("250000111111.jpg"), true);
  });
});

describe("zip listing", () => {
  it("extracts only image entries from a zip", async () => {
    const zipped = zipSync({
      "250000111111.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      "readme.txt": new Uint8Array([1, 2, 3]),
      "__MACOSX/._skip.jpg": new Uint8Array([0xff, 0xd8]),
    });
    const file = new File([zipped], "fotos.zip", { type: "application/zip" });
    const entries = await listImagesFromZip(file);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "250000111111.jpg");
  });
});

describe("applyCandidatoFotos cadastro protection", () => {
  it("does not overwrite featured cadastro foto when already set", async () => {
    const featured = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    assert.ok(featured);
    featured.foto_url = "https://cdn.example/oficial.jpg";
    const result = await applyCandidatoFotos([
      {
        numero: "13",
        cargo: "Governador",
        foto_url: "https://cdn.example/urna.jpg",
      },
    ]);
    assert.equal(result.skippedCadastroFoto, 1);
    assert.equal(result.updated, 0);
    const still = getMockCandidatos().find(
      (c) => c.numero === "13" && c.cargo === "Governador"
    );
    assert.equal(still?.foto_url, "https://cdn.example/oficial.jpg");
  });
});
