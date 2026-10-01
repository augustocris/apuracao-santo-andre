import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cameraConstraintLadder,
  cameraErrorKind,
  cameraStartAttempts,
  isAppleTouchDevice,
  liveScanConfig,
  useBarcodeDetector,
} from "./ios-camera";

describe("iPhone / Safari camera helpers", () => {
  it("detects iPhone and iPadOS, not Android", () => {
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

  it("first getUserMedia is facingMode environment on Android and iPhone", () => {
    for (const apple of [true, false]) {
      const first = cameraStartAttempts(apple)[0];
      assert.deepEqual(first.cameraIdOrConfig, { facingMode: "environment" });
      assert.equal(first.videoConstraints, undefined);
      const json = JSON.stringify(first);
      assert.doesNotMatch(json, /1920/);
      assert.doesNotMatch(json, /"min"/);
      assert.equal("width" in first.cameraIdOrConfig, false);
      assert.equal("height" in first.cameraIdOrConfig, false);
    }
  });

  it("does not require 1920 on any phone", () => {
    for (const apple of [true, false]) {
      for (const c of cameraConstraintLadder(apple)) {
        const json = JSON.stringify(c);
        assert.doesNotMatch(json, /"min":\s*1280/);
        assert.doesNotMatch(json, /"min":\s*1920/);
        const width = c.width;
        if (width && typeof width === "object" && "min" in width) {
          assert.fail("constraints must not set width.min");
        }
      }
    }
  });

  it("scan config has no aspectRatio (avoids applyConstraints Overconstrained)", () => {
    assert.equal("aspectRatio" in liveScanConfig(false), false);
    assert.equal("aspectRatio" in liveScanConfig(true), false);
  });

  it("turns BarcodeDetector off on iOS, on on Android", () => {
    assert.equal(useBarcodeDetector(true), false);
    assert.equal(useBarcodeDetector(false), true);
  });

  it("distinguishes Overconstrained from missing camera", () => {
    const over = { name: "OverconstrainedError", message: "Failed to apply constraints" };
    const missing = { name: "NotFoundError", message: "Requested device not found" };
    assert.equal(cameraErrorKind(over), "overconstrained");
    assert.equal(cameraErrorKind(missing), "notfound");
    assert.equal(
      cameraErrorKind("Error getting userMedia, error = OverconstrainedError: Constraint"),
      "overconstrained"
    );
    assert.notEqual(cameraErrorKind("exactly 1 key"), "overconstrained");
  });
});
