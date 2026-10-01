import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  duplicateFeedback,
  duplicateUrnaMessage,
  fiscalSuccessMessage,
  hasWhatsappSuporte,
  isNetworkError,
  waitingSecondQrLabel,
  whatsappHref,
  whatsappLabel,
} from "./fiscal-feedback";

describe("fiscal feedback copy", () => {
  it("success names zona and seção after confirm", () => {
    assert.equal(fiscalSuccessMessage("001", "0477"), "BU zona 001 seção 0477 enviada.");
  });

  it("duplicate says já enviada, not a camera error", () => {
    const fb = duplicateFeedback("247", "0123");
    assert.equal(fb.kind, "duplicate");
    assert.match(fb.title, /já enviada/i);
    assert.match(duplicateUrnaMessage("247", "0123"), /já enviada/);
    assert.match(fb.nextStep, /j[aá] foi gravada/i);
  });

  it("one-line waiting status after QR 1", () => {
    assert.equal(
      waitingSecondQrLabel("001", "0477"),
      "Falta o 2º QR · zona 001 seção 0477"
    );
  });
});

describe("WhatsApp da central", () => {
  it("empty state does not invent a number", () => {
    assert.equal(whatsappLabel(""), "peça o WhatsApp à central");
    assert.equal(whatsappLabel(null), "peça o WhatsApp à central");
    assert.equal(whatsappLabel("123"), "peça o WhatsApp à central");
    assert.equal(hasWhatsappSuporte(""), false);
    assert.equal(whatsappHref(""), null);
  });

  it("builds wa.me only when a real number is stored", () => {
    assert.equal(hasWhatsappSuporte("11 98888-7777"), true);
    assert.equal(whatsappHref("11988887777"), "https://wa.me/5511988887777");
    assert.equal(whatsappLabel("11 98888-7777"), "11 98888-7777");
  });
});

describe("network detection", () => {
  it("recognizes fetch failures", () => {
    assert.equal(isNetworkError(new Error("Failed to fetch")), true);
    assert.equal(isNetworkError(new Error("duplicate")), false);
  });
});
