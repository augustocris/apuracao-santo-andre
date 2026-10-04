import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cameraConstraintLadder,
  cameraErrorKind,
  cameraStartAttempts,
  forceScannerSurface,
  GESTURE_CAMERA_CONSTRAINTS,
  isAppleTouchDevice,
  hasScannerSurface,
  liveScanConfig,
  LIVE_SCAN_FPS,
  qrboxForDenseTse,
  shouldAcceptLiveDecode,
  sizeLiveVideoToContainer,
  requestCameraFromUserGesture,
  revealLiveScannerElement,
  useBarcodeDetector,
  withPrefetchedMediaStream,
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
      assert.equal("width" in first.cameraIdOrConfig, false);
      assert.equal("height" in first.cameraIdOrConfig, false);
      const idJson = JSON.stringify(first.cameraIdOrConfig);
      assert.doesNotMatch(idJson, /1920/);
      assert.doesNotMatch(idJson, /"min"/);
    }
    const ios = cameraStartAttempts(true)[0];
    assert.equal(ios.videoConstraints, undefined);
    const android = cameraStartAttempts(false)[0];
    assert.equal(
      JSON.stringify(android.videoConstraints?.width),
      JSON.stringify({ ideal: 1920 })
    );
    assert.doesNotMatch(JSON.stringify(android.videoConstraints), /"min"/);
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

  it("uses ZXing on Android and iPhone (BarcodeDetector misses dense TSE)", () => {
    assert.equal(useBarcodeDetector(true), false);
    assert.equal(useBarcodeDetector(false), false);
  });

  it("accepts the first live decode even before sessionLive / ignoreUntil", () => {
    assert.equal(
      shouldAcceptLiveDecode({
        handled: false,
        busy: false,
        sessionLive: true,
        ignoreUntil: 0,
        now: 1_000,
      }),
      true
    );
    assert.equal(
      shouldAcceptLiveDecode({
        handled: false,
        busy: false,
        sessionLive: false,
        ignoreUntil: 0,
        now: 1_000,
      }),
      true
    );
    assert.equal(
      shouldAcceptLiveDecode({
        handled: false,
        busy: false,
        sessionLive: true,
        ignoreUntil: 1_200,
        now: 1_000,
      }),
      false
    );
  });

  it("scans at a high enough fps for dense TSE QR", () => {
    assert.equal(liveScanConfig(true).fps, LIVE_SCAN_FPS);
    assert.equal(liveScanConfig(false).fps, LIVE_SCAN_FPS);
    assert.ok(LIVE_SCAN_FPS >= 18);
  });

  it("qrbox covers ~90% of the viewfinder and never exceeds it", () => {
    const box = qrboxForDenseTse(400, 300);
    assert.equal(box.width, Math.floor(300 * 0.9));
    assert.equal(box.height, box.width);
    assert.ok(box.width <= 300);
    assert.ok(box.width / 300 >= 0.89);
    const tall = qrboxForDenseTse(720, 1280);
    assert.ok(tall.width / 720 >= 0.89);
    assert.ok(tall.width <= 720);
    assert.ok(tall.height <= 1280);
    const tiny = qrboxForDenseTse(40, 80);
    assert.ok(tiny.width <= 40 || tiny.width === 280);
  });

  it("reveals a hidden scanner so html5-qrcode can measure a real box", () => {
    const el = {
      hidden: true,
      classList: {
        removed: [] as string[],
        remove(...names: string[]) {
          this.removed.push(...names);
        },
      },
      style: {} as Record<string, string>,
      removeAttribute(name: string) {
        if (name === "hidden") this.hidden = false;
      },
      clientWidth: 0,
      clientHeight: 0,
    };
    revealLiveScannerElement(el as unknown as HTMLElement);
    assert.equal(el.hidden, false);
    assert.equal(el.style.display, "block");
    assert.equal(el.style.width, "100%");
    assert.ok(el.classList.removed.includes("hidden"));
    assert.equal(hasScannerSurface({ clientWidth: 0, clientHeight: 0 }), false);
    assert.equal(hasScannerSurface({ clientWidth: 320, clientHeight: 240 }), true);
  });

  it("forces a pixel box when the scanner is still 0×0", () => {
    const el = {
      hidden: true,
      classList: {
        removed: [] as string[],
        remove(...names: string[]) {
          this.removed.push(...names);
        },
      },
      style: {} as Record<string, string>,
      removeAttribute(name: string) {
        if (name === "hidden") this.hidden = false;
      },
      clientWidth: 0,
      clientHeight: 0,
      offsetWidth: 0,
      offsetHeight: 0,
      parentElement: { clientWidth: 360 },
      querySelectorAll() {
        return [];
      },
    };
    const sized = forceScannerSurface(el as unknown as HTMLElement);
    assert.equal(sized, false);
    assert.match(el.style.width, /px/);
    assert.match(el.style.height, /px/);
    assert.ok(Number.parseInt(el.style.width, 10) >= 320);
    sizeLiveVideoToContainer(el as unknown as HTMLElement);
  });

  it("gesture getUserMedia is facingMode environment with no min/1920/aspectRatio", () => {
    const json = JSON.stringify(GESTURE_CAMERA_CONSTRAINTS);
    assert.deepEqual(GESTURE_CAMERA_CONSTRAINTS.video, { facingMode: "environment" });
    assert.equal(GESTURE_CAMERA_CONSTRAINTS.audio, false);
    assert.doesNotMatch(json, /1920/);
    assert.doesNotMatch(json, /aspectRatio/);
    assert.doesNotMatch(json, /"min"/);
  });

  it("requestCameraFromUserGesture calls getUserMedia in the same tick", () => {
    const fake = { getTracks: () => [] } as unknown as MediaStream;
    let calls = 0;
    const gum = {
      getUserMedia: (constraints: MediaStreamConstraints) => {
        calls += 1;
        assert.deepEqual(constraints, GESTURE_CAMERA_CONSTRAINTS);
        return Promise.resolve(fake);
      },
    };
    const pending = requestCameraFromUserGesture(gum);
    assert.equal(calls, 1, "getUserMedia must run before any await");
    return pending.then((stream) => {
      assert.equal(stream, fake);
    });
  });

  it("withPrefetchedMediaStream hands html5-qrcode the click stream", async () => {
    const fake = { getTracks: () => [] } as unknown as MediaStream;
    const later = { getTracks: () => [] } as unknown as MediaStream;
    const devices = {
      getUserMedia: async (_constraints?: MediaStreamConstraints) => later,
    };
    const seen: MediaStream[] = [];
    await withPrefetchedMediaStream(
      Promise.resolve(fake),
      async () => {
        seen.push(await devices.getUserMedia({ video: true }));
        seen.push(await devices.getUserMedia({ video: true }));
      },
      devices
    );
    assert.equal(seen[0], fake);
    assert.equal(seen[1], later);
    const restored = await devices.getUserMedia();
    assert.equal(restored, later);
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
