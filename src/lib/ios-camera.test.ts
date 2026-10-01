import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cameraConstraintLadder,
  isAppleTouchDevice,
  useBarcodeDetector,
} from "./ios-camera";

describe("iPhone / Safari camera helpers", () => {
  it("detects iPhone and iPadOS", () => {
    assert.equal(
      isAppleTouchDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        5
      ),
      true
    );
    assert.equal(isAppleTouchDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
    assert.equal(
      isAppleTouchDevice(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120",
        5
      ),
      false
    );
  });

  it("does not require 1920 on iPhone", () => {
    const ladder = cameraConstraintLadder(true);
    assert.equal(ladder.length >= 1, true);
    for (const c of ladder) {
      const width = c.width;
      const json = JSON.stringify(c);
      assert.doesNotMatch(json, /"min":\s*1280/);
      assert.doesNotMatch(json, /"min":\s*1920/);
      if (width && typeof width === "object" && "min" in width) {
        assert.fail("iPhone constraints must not set width.min");
      }
    }
    assert.equal(ladder[0].facingMode, "environment");
  });

  it("Android may ask ideal 1920 without a min", () => {
    const first = cameraConstraintLadder(false)[0];
    const width = first.width;
    assert.ok(width && typeof width === "object" && "ideal" in width);
    assert.equal((width as { ideal?: number }).ideal, 1920);
    assert.equal((width as { min?: number }).min, undefined);
  });

  it("turns BarcodeDetector off on iOS, on on Android", () => {
    assert.equal(useBarcodeDetector(true), false);
    assert.equal(useBarcodeDetector(false), true);
  });
});
