import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("telão desligado", () => {
  it("does not import dashboard fetch, Realtime, or TelaoScreen", () => {
    const src = readFileSync(new URL("../app/telao/page.tsx", import.meta.url), "utf8");
    assert.match(src, /Telão desligado/);
    assert.doesNotMatch(src, /from ["']@\/lib\/data["']/);
    assert.doesNotMatch(src, /from ["']@\/components\/telao/);
    assert.doesNotMatch(src, /subscribeLive/);
    assert.doesNotMatch(src, /TelaoScreen/);
    assert.doesNotMatch(src, /createClient|supabase-js/i);
    assert.doesNotMatch(src, /TELAO_POLL/);
  });
});
