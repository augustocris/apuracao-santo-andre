/** Second-pass live decode: sample the <video> by intrinsic pixels, not client box. */

export const LIVE_FRAME_FALLBACK_AFTER_MS = 500;
export const LIVE_FRAME_INTERVAL_MS = 400;
export const LIVE_FRAME_MAX_EDGE = 1280;

export function isLiveVideoDecodable(video: {
  videoWidth: number;
  videoHeight: number;
  readyState: number;
}): boolean {
  return (
    video.readyState >= 2 &&
    Number.isFinite(video.videoWidth) &&
    Number.isFinite(video.videoHeight) &&
    video.videoWidth >= 80 &&
    video.videoHeight >= 80
  );
}

/** html5-qrcode foreverScan uses clientWidth — 0 → NaN crop → no decode. */
export function html5QrcodeWouldMissFrames(video: {
  clientWidth: number;
  clientHeight: number;
  videoWidth: number;
  videoHeight: number;
}): boolean {
  return (
    video.clientWidth < 50 ||
    video.clientHeight < 50 ||
    !Number.isFinite(video.videoWidth / video.clientWidth) ||
    !Number.isFinite(video.videoHeight / video.clientHeight)
  );
}

export function shouldStartFrameFallback(opts: {
  hasAcceptedDecode: boolean;
  startedAt: number;
  now: number;
}): boolean {
  if (opts.hasAcceptedDecode) return false;
  return opts.now - opts.startedAt >= LIVE_FRAME_FALLBACK_AFTER_MS;
}

/**
 * After QR 1, `handled` is briefly true until resetKey. The frame loop must
 * stay armed (keepOpen) so QR 2+ is still sampled — html5-qrcode often misses
 * dense TSE parts once the first decode already fired.
 */
export function shouldRescheduleFrameFallback(opts: {
  sessionLive: boolean;
  handled: boolean;
  keepOpen: boolean;
}): boolean {
  if (!opts.sessionLive) return false;
  if (opts.keepOpen) return true;
  return !opts.handled;
}

export function frameScanSize(
  videoWidth: number,
  videoHeight: number
): { width: number; height: number } {
  const w = Math.max(0, Math.floor(videoWidth));
  const h = Math.max(0, Math.floor(videoHeight));
  const maxEdge = Math.max(w, h);
  if (maxEdge <= LIVE_FRAME_MAX_EDGE) return { width: w, height: h };
  const scale = LIVE_FRAME_MAX_EDGE / maxEdge;
  return {
    width: Math.max(80, Math.round(w * scale)),
    height: Math.max(80, Math.round(h * scale)),
  };
}

export function copyVideoFrameToCanvas(
  video: { videoWidth: number; videoHeight: number },
  canvas: { width: number; height: number },
  drawImage: (
    dw: number,
    dh: number
  ) => void
): boolean {
  if (!isLiveVideoDecodable({ ...video, readyState: 2 })) return false;
  const size = frameScanSize(video.videoWidth, video.videoHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  drawImage(size.width, size.height);
  return true;
}

export async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  name = "bu-live-frame.jpg"
): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((next) => resolve(next), "image/jpeg", 0.92);
    } catch {
      resolve(null);
    }
  });
  if (!blob || blob.size < 80) return null;
  return new File([blob], name, { type: "image/jpeg" });
}
