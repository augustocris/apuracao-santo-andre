import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  duplicateFeedback,
  duplicateUrnaMessage,
  fiscalSuccessMessage,
  hasWhatsappSuporte,
  incompleteQrFeedback,
  isNetworkError,
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
    assert.doesNotMatch(fb.cause, /c[aâ]mera/i);
    assert.match(fb.nextStep, /n[aã]o é falha de c[aâ]mera/i);
  });

  it("incomplete 1 de 2 tells fiscal to scan the rest", () => {
    const fb = incompleteQrFeedback(1, 2);
    assert.equal(fb.kind, "incomplete_qr");
    assert.equal(fb.title, "QR 1 de 2");
    assert.match(fb.nextStep, /pr[oó]ximo QR/i);
    assert.match(fb.nextStep, /N[aã]o envie ainda/i);
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
