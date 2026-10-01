import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buShareText,
  canShareFiles,
  fileForShare,
  shareBuPhoto,
  whatsappFallbackHref,
} from "./whatsapp-share";

describe("buShareText", () => {
  it("includes wa.me when the central number is configured", () => {
    assert.match(buShareText("11988887777"), /wa\.me\/5511988887777/);
    assert.match(buShareText("11988887777"), /Apuração Santo André/);
  });

  it("does not invent a number when WhatsApp is empty", () => {
    assert.doesNotMatch(buShareText(""), /wa\.me/);
    assert.match(buShareText(""), /Peça o WhatsApp à central/);
  });
});

describe("fileForShare", () => {
  it("names an untitled capture without treating it as a QR decode", () => {
    const raw = new File([new Uint8Array([1, 2, 3])], "", { type: "image/jpeg" });
    const named = fileForShare(raw);
    assert.match(named.name, /bu-santo-andre\.jpg/);
    assert.equal(named.type, "image/jpeg");
  });
});

describe("canShareFiles", () => {
  it("is false without navigator.share", () => {
    assert.equal(canShareFiles([new File(["x"], "a.jpg", { type: "image/jpeg" })]), false);
  });
});

describe("shareBuPhoto", () => {
  it("shares files+text immediately and never treats the image as a QR", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "bu.jpg", { type: "image/jpeg" });
    const shared: ShareData[] = [];
    const nav = globalThis.navigator as Navigator | undefined;
    const previousShare = nav?.share;
    const previousCanShare = nav?.canShare;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        ...(nav ?? {}),
        canShare: (data?: ShareData) => Boolean(data?.files?.length),
        share: async (data: ShareData) => {
          shared.push(data);
        },
      },
    });
    try {
      const result = await shareBuPhoto(file, "11988887777");
      assert.equal(result, "shared");
      assert.equal(shared.length, 1);
      assert.equal(shared[0].files?.length, 1);
      assert.match(String(shared[0].text), /wa\.me/);
      assert.equal(shared[0].title, undefined);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          ...(nav ?? {}),
          share: previousShare,
          canShare: previousCanShare,
        },
      });
    }
  });
});
describe("whatsappFallbackHref", () => {
  it("returns wa.me only for a real number", () => {
    assert.equal(whatsappFallbackHref("11988887777"), "https://wa.me/5511988887777");
    assert.equal(whatsappFallbackHref(""), null);
  });
});
