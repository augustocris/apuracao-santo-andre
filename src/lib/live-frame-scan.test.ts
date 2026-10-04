import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  copyVideoFrameToCanvas,
  frameScanSize,
  html5QrcodeWouldMissFrames,
  isLiveVideoDecodable,
  LIVE_FRAME_FALLBACK_AFTER_MS,
  LIVE_FRAME_INTERVAL_MS,
  shouldRescheduleFrameFallback,
  shouldStartFrameFallback,
} from "./live-frame-scan";

describe("live frame fallback", () => {
  it("needs real video pixels, not a 0×0 client box", () => {
    assert.equal(
      isLiveVideoDecodable({ videoWidth: 1920, videoHeight: 1080, readyState: 2 }),
      true
    );
    assert.equal(
      isLiveVideoDecodable({ videoWidth: 0, videoHeight: 0, readyState: 4 }),
      false
    );
    assert.equal(
      html5QrcodeWouldMissFrames({
        clientWidth: 0,
        clientHeight: 0,
        videoWidth: 1920,
        videoHeight: 1080,
      }),
      true
    );
    assert.equal(
      html5QrcodeWouldMissFrames({
        clientWidth: 360,
        clientHeight: 480,
        videoWidth: 1920,
        videoHeight: 1080,
      }),
      false
    );
  });

  it("starts a second pass if the first decode never arrives", () => {
    assert.ok(LIVE_FRAME_FALLBACK_AFTER_MS <= 800);
    assert.ok(LIVE_FRAME_INTERVAL_MS <= 500);
    assert.equal(
      shouldStartFrameFallback({
        hasAcceptedDecode: false,
        startedAt: 1_000,
        now: 1_000 + LIVE_FRAME_FALLBACK_AFTER_MS,
      }),
      true
    );
    assert.equal(
      shouldStartFrameFallback({
        hasAcceptedDecode: true,
        startedAt: 1_000,
        now: 5_000,
      }),
      false
    );
  });

  it("keeps the frame loop armed after QR 1 when keepOpen (QR 2+)", () => {
    assert.equal(
      shouldRescheduleFrameFallback({
        sessionLive: true,
        handled: true,
        keepOpen: true,
      }),
      true
    );
    assert.equal(
      shouldRescheduleFrameFallback({
        sessionLive: true,
        handled: false,
        keepOpen: true,
      }),
      true
    );
    assert.equal(
      shouldRescheduleFrameFallback({
        sessionLive: true,
        handled: true,
        keepOpen: false,
      }),
      false
    );
    assert.equal(
      shouldRescheduleFrameFallback({
        sessionLive: false,
        handled: false,
        keepOpen: true,
      }),
      false
    );
  });

  it("samples the video by videoWidth, not clientWidth", () => {
    const size = frameScanSize(1920, 1080);
    assert.equal(size.width, 1280);
    assert.equal(size.height, 720);
    const small = frameScanSize(640, 480);
    assert.deepEqual(small, { width: 640, height: 480 });

    const canvas = { width: 0, height: 0 };
    let drawn = { w: 0, h: 0 };
    const ok = copyVideoFrameToCanvas(
      { videoWidth: 1920, videoHeight: 1080 },
      canvas,
      (dw, dh) => {
        drawn = { w: dw, h: dh };
      }
    );
    assert.equal(ok, true);
    assert.equal(canvas.width, 1280);
    assert.equal(canvas.height, 720);
    assert.deepEqual(drawn, { w: 1280, h: 720 });
  });
});
