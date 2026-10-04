import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pinMatchesAdmin,
  resolveAdminPin,
} from "./admin-pin";
import { DEFAULT_CHEFE_PIN } from "./cargos";
import { createChefe, unlockAdminByPin, unlockChefeByPin } from "./data";

describe("resolveAdminPin", () => {
  it("falls back to andre2026 when config is empty", () => {
    assert.equal(resolveAdminPin(null), DEFAULT_CHEFE_PIN);
    assert.equal(resolveAdminPin(""), "andre2026");
    assert.equal(resolveAdminPin("   "), "andre2026");
  });

  it("uses apuracao_config.chefe_pin when set", () => {
    assert.equal(resolveAdminPin("  secret2026  "), "secret2026");
  });
});

describe("pinMatchesAdmin", () => {
  it("accepts Cristiano's pin and rejects others", () => {
    assert.equal(pinMatchesAdmin("andre2026", null), true);
    assert.equal(pinMatchesAdmin("  andre2026  ", ""), true);
    assert.equal(pinMatchesAdmin("maria-teste-2026", null), false);
    assert.equal(pinMatchesAdmin("", null), false);
    assert.equal(pinMatchesAdmin("andre2026", "outro-pin"), false);
    assert.equal(pinMatchesAdmin("outro-pin", "outro-pin"), true);
  });
});

describe("unlockAdminByPin", () => {
  it("accepts andre2026 and ignores other chefes table PINs", async () => {
    const extra = await createChefe({
      nome: "Maria Admin Test",
      pin: "maria-admin-test-2026",
    });
    assert.ok(extra.id);

    assert.equal(await unlockAdminByPin("andre2026"), true);
    assert.equal(await unlockAdminByPin("maria-admin-test-2026"), false);
    assert.equal(await unlockAdminByPin("pin-errado"), false);

    const chefeMaria = await unlockChefeByPin("maria-admin-test-2026");
    assert.ok(chefeMaria);
    assert.equal(chefeMaria.pin, "maria-admin-test-2026");
  });
});
