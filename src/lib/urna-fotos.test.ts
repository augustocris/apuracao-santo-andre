import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zipSync } from "fflate";
import { applyCandidatoFotos } from "./data";
import { getMockCandidatos } from "./mock-store";
import {
  buildUrnaFotoIndex,
  describeUrnaZipError,
  extractSqFromUrnaFilename,
  formatUrnaFotoProgress,
  inspectUrnaZip,
  isUrnaImagePath,
  listImagesFromZip,
  matchUrnaFotoFilename,
  planStorageFotoLinks,
  shouldInflateUrnaZipEntry,
  sqDigitStringsEqual,
  storageZipOnlyHint,
  summarizeUrnaFotos,
  summarizeVincular,
  takeInputFiles,
  urnaFotoIdKeys,
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
    numero: "2739",
    cargo: "Deputado Federal",
    sq_candidato: "250002530091",
    origem: "catalogo",
    foto_url: null,
  },
  {
    numero: "45123",
    cargo: "Deputado Estadual",
    sq_candidato: "2500002530091",
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

  it("extracts SQ from FSP/FBR + 13 digits + _div.jpg (optional folder)", () => {
    const names = [
      "FSP2500002530091_div.jpg",
      "FBR2500002530091_div.jpg",
      "foto_cand2026_SP_div/FSP2500002530091_div.jpg",
      "fotos\\FSP2500002530091_div.JPG",
    ];
    for (const name of names) {
      assert.equal(extractSqFromUrnaFilename(name), "2500002530091", name);
    }
    assert.equal(extractSqFromUrnaFilename("FSP250002530091_div.jpg"), "250002530091");
    assert.ok(sqDigitStringsEqual("2500002530091", "2500002530091"));
    assert.ok(sqDigitStringsEqual("02500002530091", "2500002530091"));
    const hit = matchUrnaFotoFilename("FSP2500002530091_div.jpg", index);
    assert.ok(hit && "target" in hit);
    assert.equal(hit.via, "sq");
    assert.equal(hit.target.numero, "45123");
    assert.equal(hit.target.sq_candidato, "2500002530091");
  });

  it("matches TSE FSP{sq}_div photos (any case, subfolders)", () => {
    const samples = [
      "FSP250002530091_div.jpg",
      "fsp250002530091_DIV.PNG",
      "250002530091_div.jpeg",
      "FSP250002530091.jpg",
      "foto_cand2026_SP_div/FSP250002530091_div.jpg",
      "fotos\\FSP250002530091_div.JPG",
    ];
    for (const name of samples) {
      const hit = matchUrnaFotoFilename(name, index);
      assert.ok(hit && "target" in hit, name);
      assert.equal(hit.via, "sq", name);
      assert.equal(hit.target.numero, "2739", name);
    }
  });

  it("matches TSE FBR{sq}_div photos the same way (digit run = SQ_CANDIDATO)", () => {
    const samples = [
      "FBR250000555555_div.jpg",
      "fbr250000555555_DIV.PNG",
      "250000555555_div.jpeg",
      "FBR250000555555.jpg",
      "foto_cand2026_BR_div/FBR250000555555_div.jpg",
      "fotos\\FBR250000555555_div.JPG",
      "2026_FBR250000555555_div.jpg",
    ];
    for (const name of samples) {
      const hit = matchUrnaFotoFilename(name, index);
      assert.ok(hit && "target" in hit, name);
      assert.equal(hit.via, "sq", name);
      assert.equal(hit.target.cargo, "Presidente", name);
      assert.equal(hit.target.sq_candidato, "250000555555", name);
    }
    assert.ok(
      urnaFotoIdKeys("urna/FBR250000555555_div-1728000000000.jpg").includes(
        "250000555555"
      )
    );
    assert.deepEqual(urnaFotoIdKeys("FBR250000555555_div.jpg")[0], "250000555555");
    assert.deepEqual(
      urnaFotoIdKeys("2026_FBR250000555555_div.jpg")[0],
      "250000555555"
    );
  });

  it("extracts the long digit run instead of concatenating leftover digits", () => {
    assert.deepEqual(urnaFotoIdKeys("2026_FSP250002530091_div.jpg")[0], "250002530091");
    const hit = matchUrnaFotoFilename("2026_FSP250002530091_div.jpg", index);
    assert.ok(hit && "target" in hit);
    assert.equal(hit.target.sq_candidato, "250002530091");
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
      "foto_cand2026_SP_div/FSP250002530091_div.jpg": new Uint8Array([
        0xff, 0xd8, 0xff, 0xd9,
      ]),
      "foto_cand2026_BR_div/FBR250000555555_div.jpg": new Uint8Array([
        0xff, 0xd8, 0xff, 0xd9,
      ]),
      "readme.txt": new Uint8Array([1, 2, 3]),
      "__MACOSX/._skip.jpg": new Uint8Array([0xff, 0xd8]),
    });
    const file = new File([zipped], "foto_cand2026_SP_div.zip", {
      type: "application/zip",
    });
    const entries = await listImagesFromZip(file);
    assert.equal(entries.length, 3);
    const names = entries.map((e) => e.name).sort();
    assert.deepEqual(names, [
      "250000111111.jpg",
      "foto_cand2026_BR_div/FBR250000555555_div.jpg",
      "foto_cand2026_SP_div/FSP250002530091_div.jpg",
    ]);
  });
});

describe("planStorageFotoLinks", () => {
  it("links storage files to catalog rows missing foto_url by SQ", () => {
    const planned = planStorageFotoLinks(
      [
        "urna/FBR250000555555_div.jpg",
        "urna/FSP250002530091_div.jpg",
        "urna/ignorado.txt",
      ],
      index
    );
    assert.equal(planned.length, 2);
    assert.ok(
      planned.some((p) => p.cargo === "Presidente" && p.numero === "13")
    );
    assert.ok(
      planned.some((p) => p.cargo === "Deputado Federal" && p.numero === "2739")
    );
    assert.equal(
      planned.some((p) => p.cargo === "Governador" && p.numero === "13"),
      false
    );
  });
});

describe("zip stream inspect (no inflate of unmatched)", () => {
  it("counts FSP matches without requiring every jpg in RAM", async () => {
    const zipped = zipSync({
      "FSP2500002530091_div.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      "FSP2500002530092_div.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      "foto_cand2026_SP_div/FSP250002530091_div.jpg": new Uint8Array([
        0xff, 0xd8, 0xff, 0xd9,
      ]),
      "readme.txt": new Uint8Array([1, 2, 3]),
    });
    const file = new File([zipped], "foto_cand2026_SP_div.zip", {
      type: "application/zip",
    });
    const info = await inspectUrnaZip(file, index);
    assert.equal(info.scanned, 3);
    assert.equal(info.matched, 2);
    assert.equal(info.unmatched, 1);
    assert.equal(shouldInflateUrnaZipEntry("FSP2500002530091_div.jpg", index), true);
    assert.equal(shouldInflateUrnaZipEntry("FSP2500002530092_div.jpg", index), false);
  });
});

describe("takeInputFiles", () => {
  it("copies files before clearing the live input", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "foto_cand2026_SP_div.zip", {
      type: "application/zip",
    });
    const input = {
      files: { 0: file, length: 1 } as unknown as FileList,
      value: "C:\\fakepath\\foto_cand2026_SP_div.zip",
    };
    const copied = takeInputFiles(input);
    assert.equal(copied.length, 1);
    assert.equal(copied[0]?.name, "foto_cand2026_SP_div.zip");
    assert.equal(input.value, "");
    assert.equal(takeInputFiles({ files: null, value: "" }).length, 0);
  });
});

describe("zip UI status and errors", () => {
  it("starts with Lendo ZIP… and then Lidos N de ~total", () => {
    assert.equal(
      formatUrnaFotoProgress({
        done: 0,
        total: 26331,
        uploaded: 0,
        skippedCadastro: 0,
        unmatched: 0,
        ambiguous: 0,
        failed: 0,
        scanned: 0,
        phase: "reading",
        status: "Lendo ZIP…",
      }),
      "Lendo ZIP…"
    );
    assert.equal(
      formatUrnaFotoProgress({
        done: 400,
        total: 26331,
        uploaded: 0,
        skippedCadastro: 0,
        unmatched: 400,
        ambiguous: 0,
        failed: 0,
        scanned: 400,
        phase: "reading",
      }),
      "Lendo ZIP… · Lidos 400 de ~26331"
    );
    assert.match(
      formatUrnaFotoProgress({
        done: 800,
        total: 26331,
        uploaded: 12,
        skippedCadastro: 0,
        unmatched: 700,
        ambiguous: 0,
        failed: 1,
        scanned: 800,
        phase: "uploading",
      }),
      /Enviada\(s\) 12 · falhas 1/
    );
  });

  it("maps OOM / not-a-zip to a visible banner", () => {
    assert.match(describeUrnaZipError(new RangeError("Invalid array length")), /Memória esgotada/);
    assert.match(
      describeUrnaZipError(new Error("Can't find end of central directory")),
      /não parece um ZIP/
    );
  });

  it("says files seen vs SQ matched when catalog misses", () => {
    const msg = summarizeUrnaFotos({
      uploaded: 0,
      skippedCadastro: 0,
      unmatched: 26331,
      ambiguous: 0,
      failed: 0,
      scanned: 26331,
      matched: 0,
      sqInCatalog: 0,
      errors: [],
      storageConfigured: true,
    });
    assert.match(msg, /Vistos 26331/);
    assert.match(msg, /0 casaram com SQ_CANDIDATO/);
  });
});

describe("vincular banner and zip-in-bucket", () => {
  it("uses Vistos N · vinculadas M and warns when bucket is a ZIP", () => {
    const hint = storageZipOnlyHint({
      listed: 2,
      imagePaths: ["urna/resto.jpg"],
      zipPaths: ["foto_cand2026_SP_div.zip"],
      otherPaths: [],
    });
    assert.ok(hint);
    assert.match(hint ?? "", /ZIP no bucket não vale/);
    const msg = summarizeVincular({
      linked: 1,
      listed: 2,
      unmatched: 0,
      skippedCadastro: 0,
      sqFilled: 0,
      checked: 2,
      imageCount: 1,
      zipCount: 1,
      zipPaths: ["foto_cand2026_SP_div.zip"],
      zipOnlyHint: hint,
      storageConfigured: true,
    });
    assert.match(msg, /^Vistos 2 · vinculadas 1/);
    assert.match(msg, /ZIP no bucket não vale/);
    assert.equal(
      storageZipOnlyHint({
        listed: 26331,
        imagePaths: Array.from({ length: 30 }, (_, i) => `urna/${i}.jpg`),
        zipPaths: [],
        otherPaths: [],
      }),
      null
    );
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
