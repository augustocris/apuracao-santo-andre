import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertQrSetReadyToIngest,
  isQrSetComplete,
  nextMissingQrIndex,
  parseFiscalQrChunk,
} from "./bu-qr";
import {
  MAX_WHATSAPP_PHOTOS,
  assembleWhatsappPhotos,
  leftoverUrnaSummary,
  parseWhatsappPhotoQr,
  urnaGroupKey,
} from "./whatsapp-photos";

const QR1_A =
  "SEQL:01/04 HASH:AAAA IDUE:77 ZONA:383 SECA:0401 CARG:1 13:10";
const QR2_A =
  "---------- 02 / 04 ---------- SEQL:02/04 HASH:BBBB IDUE:77 CARG:1 17:8";
const QR3_A = "SEQL:03/04 ORQR:3 HASH:CCCC IDUE:77 CARG:6 4545:11";
const QR4_A = "SEQL:04/04 ORQR:4 HASH:DDDD IDUE:77 CARG:3 10:55";
const QR1_B =
  "SEQL:01/02 HASH:ZZZZ IDUE:99 ZONA:247 SECA:0123 CARG:1 13:4";
const QR2_B = "SEQL:02/02 HASH:YYYY IDUE:99 CARG:6 4545:2";

describe("assembleWhatsappPhotos", () => {
  it("assembles one 4-QR BU from still photos even when HASH differs", () => {
    const batch = assembleWhatsappPhotos([QR2_A, QR4_A, QR1_A, QR3_A]);
    assert.equal(batch.read, 4);
    assert.equal(batch.failed, 0);
    assert.equal(batch.leftover.length, 0);
    assert.equal(isQrSetComplete(batch.primary), true);
    const merged = assertQrSetReadyToIngest(batch.primary);
    assert.equal(merged.zona, "383");
    assert.equal(merged.secao, "0401");
    assert.equal(merged.urnaId, "77");
    assert.ok(merged.votes.some((v) => v.numero === "13"));
    assert.ok(merged.votes.some((v) => v.numero === "4545"));
  });

  it("keeps a leftover IDUE when the pick mixes two urnas", () => {
    const batch = assembleWhatsappPhotos([QR1_A, QR2_A, QR1_B]);
    assert.equal(batch.primary[0].urnaId, "77");
    assert.equal(isQrSetComplete(batch.primary), false);
    assert.equal(nextMissingQrIndex(batch.primary), 3);
    assert.equal(batch.leftover.length, 1);
    assert.equal(batch.leftover[0].urnaId, "99");
    const leftover = leftoverUrnaSummary(batch.leftover);
    assert.equal(leftover.urnaId, "99");
    assert.match(leftover.qrLabel, /QR 1\/2/);
  });

  it("does not mix a second urna into an already-open set", () => {
    const open = [parseFiscalQrChunk(QR1_A, [])];
    const batch = assembleWhatsappPhotos([QR1_B, QR2_B], open);
    assert.equal(urnaGroupKey(batch.primary[0]), "id:77");
    assert.equal(batch.primary.length, 1);
    assert.equal(batch.leftover.length, 2);
    assert.ok(batch.leftover.every((p) => p.urnaId === "99"));
  });

  it("holds QR 2–4 without zona and asks for QR 1", () => {
    const batch = assembleWhatsappPhotos([QR2_A, QR3_A]);
    assert.equal(isQrSetComplete(batch.primary), false);
    assert.equal(nextMissingQrIndex(batch.primary), 1);
    assert.equal(batch.primary[0].zona, "");
    const later = assembleWhatsappPhotos([QR1_A], batch.primary);
    assert.equal(later.primary[0].zona, "383");
    assert.equal(later.primary[0].secao, "0401");
    assert.equal(nextMissingQrIndex(later.primary), 4);
  });

  it("assembles a 2-QR BU from one still that decoded both 01/02 and 02/02", () => {
    const batch = assembleWhatsappPhotos([QR1_B, QR2_B]);
    assert.equal(batch.read, 2);
    assert.equal(isQrSetComplete(batch.primary), true);
    const merged = assertQrSetReadyToIngest(batch.primary);
    assert.equal(merged.zona, "247");
    assert.equal(merged.urnaId, "99");
  });

  it("counts photos that did not decode as failed", () => {
    const batch = assembleWhatsappPhotos([QR1_A, "", "not a bu"]);
    assert.equal(batch.read, 1);
    assert.equal(batch.failed, 2);
    assert.equal(parseWhatsappPhotoQr(QR2_A).urnaId, "77");
    assert.ok(MAX_WHATSAPP_PHOTOS >= 8);
  });
});
