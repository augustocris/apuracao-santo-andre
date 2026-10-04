import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasFirstOrZonaQr,
  preferFirstOrZonaQr,
  qrPartPreferenceScore,
  stackedQrCropRects,
  uniqueQrTexts,
} from "./decode-multi-qr";
import {
  SAMPLE_TSE_QR_PART1,
  SAMPLE_TSE_QR_PART2,
  TSE_QR1_ZONA_KEY,
  describeQrPayloadKeys,
  extractZonaField,
  parseBuQrText,
  parseFiscalQrChunk,
} from "./parser/bu-qr";

const QR1 =
  "---------- 01 / 02 ---------- SEQL:01/02 IDUE:1760649 ZONA:383 SECA:0001 CARG:1 13:10";
const QR2 =
  "---------- 02 / 02 ---------- SEQL:02/02 IDUE:1760649 CARG:1 17:8";

describe("stacked thermal BU crops", () => {
  it("covers top 01/02 and bottom 02/02 of a portrait print", () => {
    const rects = stackedQrCropRects(1080, 1920);
    assert.ok(rects.some((r) => r.id === "top" && r.y === 0 && r.height < 1920));
    assert.ok(rects.some((r) => r.id === "bottom" && r.y > 0));
    assert.ok(rects.some((r) => r.id === "full" && r.width === 1080));
  });
});

describe("prefer QR 1 / zona when both codes are in one frame", () => {
  it("keeps both parts and sorts 01/02 first", () => {
    const ordered = preferFirstOrZonaQr([QR2, QR1, "table grain"]);
    assert.equal(ordered.length, 2);
    assert.equal(ordered[0], QR1);
    assert.equal(ordered[1], QR2);
    assert.equal(hasFirstOrZonaQr([QR2]), false);
    assert.equal(hasFirstOrZonaQr([QR2, QR1]), true);
    assert.ok(qrPartPreferenceScore(QR1) > qrPartPreferenceScore(QR2));
  });

  it("dedupes the same payload", () => {
    assert.equal(uniqueQrTexts([QR1, QR1, `  ${QR1}  `]).length, 1);
  });
});

describe("QR1 zona keys", () => {
  it("finds official TSE key ZONA on part 1", () => {
    const hit = extractZonaField(SAMPLE_TSE_QR_PART1);
    assert.equal(hit?.key, TSE_QR1_ZONA_KEY);
    assert.equal(hit?.key, "ZONA");
    assert.equal(hit?.value, "247");
    assert.equal(extractZonaField(SAMPLE_TSE_QR_PART2)?.key, "ZONA");
    const dump = describeQrPayloadKeys(SAMPLE_TSE_QR_PART1);
    assert.match(dump, /keys=.*ZONA/);
    assert.match(dump, /SECA|CARG/);
  });

  it("accepts NR_ZONA, ZE and glued ZonaEleitoral without colon", () => {
    assert.equal(extractZonaField("NR_ZONA:383 NR_SECAO:0001")?.key, "NR_ZONA");
    assert.equal(extractZonaField("ZE:306 SECA:12")?.key, "ZE");
    assert.equal(extractZonaField("ZonaEleitoral:0001 SECA:1")?.value, "0001");
    assert.equal(extractZonaField("ZonaEleitoral 383 SECA:1")?.value, "383");
    assert.equal(parseBuQrText("ZONA 383 SECA 0001 CARG:1 13:10").zona, "383");
    assert.equal(parseBuQrText("NR_ZONA:156 NR_SECA:0401 CARG:1 13:1").zona, "156");
    assert.equal(parseBuQrText("ZE:264 SE:0008 CARG:1 13:1").zona, "264");
  });

  it("assembles 01/02 + 02/02 from one WhatsApp still", () => {
    const p1 = parseFiscalQrChunk(QR1, []);
    const p2 = parseFiscalQrChunk(QR2, [p1]);
    assert.equal(p1.zona, "383");
    assert.equal(extractZonaField(QR1)?.key, "ZONA");
    assert.equal(p2.zona, "383");
  });
});
