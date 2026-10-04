/** iPhone / iPad (incl. iPadOS that spoofs MacIntel). Android stays false. */
export function isAppleTouchDevice(ua = "", maxTouchPoints = 0): boolean {
  if (/iP(hone|od|ad)/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return false;
}

export function currentAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isAppleTouchDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export type CameraStartAttempt = {
  /** First arg to Html5Qrcode.start — library only accepts facingMode or deviceId. */
  cameraIdOrConfig: MediaTrackConstraints;
  /**
   * When set, passed as config.videoConstraints so html5-qrcode does not
   * run createVideoConstraints (which rejects `ideal` and extra keys).
   */
  videoConstraints?: MediaTrackConstraints;
};

/** Android-only: ask for more pixels so dense TSE QRs stay sharp. Never `min`. */
export const ANDROID_IDEAL_VIDEO: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/**
 * First cameraIdOrConfig is always `{ facingMode: "environment" }` — no min.
 * Android may add ideal 1920 in videoConstraints; iPhone stays facingMode-only.
 */
export function cameraStartAttempts(appleTouch: boolean): CameraStartAttempt[] {
  const iosOrFallback: CameraStartAttempt[] = [
    { cameraIdOrConfig: { facingMode: "environment" } },
    {
      cameraIdOrConfig: { facingMode: "environment" },
      videoConstraints: { facingMode: { ideal: "environment" } },
    },
    {
      cameraIdOrConfig: { facingMode: "environment" },
      videoConstraints: {},
    },
  ];
  if (appleTouch) return iosOrFallback;
  return [
    {
      cameraIdOrConfig: { facingMode: "environment" },
      videoConstraints: ANDROID_IDEAL_VIDEO,
    },
    ...iosOrFallback,
  ];
}

/** ~90% of the live viewfinder — never larger than the box (0×0 crop = no decode). */
export function qrboxForDenseTse(
  viewfinderWidth: number,
  viewfinderHeight: number
): { width: number; height: number } {
  const w = Math.max(0, viewfinderWidth);
  const h = Math.max(0, viewfinderHeight);
  const minEdge = Math.min(w, h);
  if (!Number.isFinite(minEdge) || minEdge < 50) {
    return { width: 280, height: 280 };
  }
  const size = Math.max(50, Math.floor(minEdge * 0.9));
  return {
    width: Math.min(size, w),
    height: Math.min(size, h),
  };
}

/** @deprecated use cameraStartAttempts — kept for tests that check the first getUserMedia. */
export function cameraConstraintLadder(appleTouch: boolean): MediaTrackConstraints[] {
  return cameraStartAttempts(appleTouch).map((a) => a.videoConstraints ?? a.cameraIdOrConfig);
}

/** Dense TSE BUs need frequent frames. Keep it the same on Android and iPhone. */
export const LIVE_SCAN_FPS = 20;

/** Ignore leftover frames only after QR 1 is already in the set. First QR: 0. */
export const NEXT_QR_IGNORE_MS = 400;

/** First successful decode must pass — sessionLive / ignoreUntil must not swallow QR1. */
export function shouldAcceptLiveDecode(opts: {
  fromPhoto?: boolean;
  handled: boolean;
  busy: boolean;
  sessionLive: boolean;
  ignoreUntil: number;
  now: number;
}): boolean {
  if (opts.handled) return false;
  if (opts.fromPhoto) return !opts.busy;
  if (opts.busy) return false;
  // sessionLive is informational — first QR (ignoreUntil 0) must not wait for it.
  void opts.sessionLive;
  if (opts.ignoreUntil <= 0) return true;
  if (opts.now < opts.ignoreUntil) return false;
  return true;
}

export function liveScanConfig(_appleTouch?: boolean): {
  fps: number;
  disableFlip: true;
} {
  return {
    fps: LIVE_SCAN_FPS,
    disableFlip: true,
  };
}

/**
 * Native BarcodeDetector misses dense TSE QR codes on Android Chrome.
 * Always use ZXing via html5-qrcode.
 */
export function useBarcodeDetector(_appleTouch?: boolean): boolean {
  return false;
}

const SCANNER_HIDE_CLASSES = ["hidden", "invisible", "sr-only"] as const;

/** Min live viewfinder so html5-qrcode does not start a 0×0 canvas. */
export const SCANNER_MIN_EDGE = 160;

/**
 * html5-qrcode reads clientWidth/clientHeight when the video starts playing.
 * display:none / 0×0 → canvas 0×0 → foreverScan never decodes.
 */
export function revealLiveScannerElement(el: HTMLElement | null): void {
  if (!el) return;
  el.hidden = false;
  el.removeAttribute("hidden");
  el.classList.remove(...SCANNER_HIDE_CLASSES);
  el.style.display = "block";
  el.style.visibility = "visible";
  el.style.opacity = "1";
  el.style.width = "100%";
  el.style.minWidth = "100%";
  el.style.minHeight = "min(70vh, 520px)";
  el.style.height = "min(70vh, 520px)";
}

/**
 * html5-qrcode sets video.style.width = parent.clientWidth + "px" at start.
 * If that is 0, foreverScan draws a 0×0 canvas while the stream still plays.
 */
export function forceScannerSurface(el: HTMLElement | null): boolean {
  if (!el) return false;
  revealLiveScannerElement(el);
  void el.offsetWidth;
  if (hasScannerSurface(el)) return true;
  const parentW = el.parentElement?.clientWidth ?? 0;
  const viewport = globalThis as { innerWidth?: number; innerHeight?: number };
  const innerW = Number(viewport.innerWidth) || parentW || 360;
  const innerH = Number(viewport.innerHeight) || 640;
  const w = Math.max(parentW, Math.floor(innerW - 24), 320);
  const h = Math.max(Math.floor(innerH * 0.5), 320);
  el.style.width = `${w}px`;
  el.style.minWidth = `${w}px`;
  el.style.height = `${h}px`;
  el.style.minHeight = `${h}px`;
  void el.offsetHeight;
  return hasScannerSurface(el);
}

/** Keep the <video> from staying at width:0px after html5-qrcode creates it. */
export function sizeLiveVideoToContainer(root: HTMLElement | null): void {
  if (!root) return;
  root.querySelectorAll("video").forEach((video) => {
    video.style.width = "100%";
    video.style.maxWidth = "100%";
    video.style.height = "100%";
    video.style.maxHeight = "100%";
    video.style.objectFit = "cover";
    video.style.display = "block";
  });
}

export function hasScannerSurface(
  el: { clientWidth: number; clientHeight: number } | null,
  min = SCANNER_MIN_EDGE
): boolean {
  if (!el) return false;
  return el.clientWidth >= min && el.clientHeight >= min;
}

export function waitForScannerSurface(
  el: HTMLElement | null,
  timeoutMs = 1600
): Promise<boolean> {
  if (hasScannerSurface(el)) return Promise.resolve(true);
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (hasScannerSurface(el) || Date.now() - started > timeoutMs) {
        resolve(hasScannerSurface(el));
        return;
      }
      if (typeof requestAnimationFrame === "undefined") {
        setTimeout(tick, 16);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export type CameraErrorKind =
  | "https"
  | "permission"
  | "notfound"
  | "inuse"
  | "overconstrained"
  | "unknown";

export function stringifyCameraError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name} ${err.message}`;
  }
  if (err && typeof err === "object") {
    const name = "name" in err ? String((err as { name?: string }).name) : "";
    const message = "message" in err ? String((err as { message?: string }).message) : "";
    return `${name} ${message} ${String(err)}`;
  }
  return String(err ?? "");
}

export function cameraErrorKind(
  err: unknown,
  opts?: { secureContext?: boolean }
): CameraErrorKind {
  if (opts?.secureContext === false) return "https";
  const raw = stringifyCameraError(err);
  if (/NotAllowedError|PermissionDenied|Permission|denied/i.test(raw)) return "permission";
  if (
    /NotFoundError|DevicesNotFound|Requested device not found|no camera found|Unable to query supported devices/i.test(
      raw
    )
  ) {
    return "notfound";
  }
  if (/NotReadableError|TrackStartError|Could not start video source/i.test(raw)) {
    return "inuse";
  }
  if (/OverconstrainedError|overconstrained/i.test(raw)) return "overconstrained";
  if (/secure|https|Only secure origins/i.test(raw)) return "https";
  return "unknown";
}

export function hardenLiveVideo(root: HTMLElement | null) {
  if (!root) return;
  sizeLiveVideoToContainer(root);
  const videos = root.querySelectorAll("video");
  videos.forEach((video) => {
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.autoplay = true;
    video.setAttribute("autoplay", "");
    video.disablePictureInPicture = true;
    video.controls = false;
    void video.play().catch(() => undefined);
  });
}

/** html5-qrcode creates <video> after getUserMedia — harden as soon as it appears. */
export function watchAndHardenLiveVideo(root: HTMLElement | null): () => void {
  if (!root || typeof MutationObserver === "undefined") return () => undefined;
  hardenLiveVideo(root);
  const observer = new MutationObserver(() => hardenLiveVideo(root));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/** First getUserMedia payload — facingMode only, no min/1920/aspectRatio. */
export const GESTURE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "environment" },
};

/**
 * Invoke getUserMedia in the same synchronous turn as the click/touch.
 * Returning the Promise is fine; awaiting anything *before* this call is not
 * (iOS Safari drops the user-gesture and never shows the camera prompt).
 */
export function requestCameraFromUserGesture(
  gum?: Pick<MediaDevices, "getUserMedia"> | null
): Promise<MediaStream> {
  const media = gum ?? (typeof navigator === "undefined" ? null : navigator.mediaDevices);
  if (!media?.getUserMedia) {
    return Promise.reject(new Error("Requested device not found"));
  }
  return media.getUserMedia(GESTURE_CAMERA_CONSTRAINTS);
}

/**
 * html5-qrcode.start() awaits CameraFactory before getUserMedia, which is
 * already too late on iOS. Hand that later call the stream opened in the click.
 */
export async function withPrefetchedMediaStream<T>(
  streamPromise: Promise<MediaStream>,
  run: () => Promise<T>,
  devices?: Pick<MediaDevices, "getUserMedia"> | null
): Promise<T> {
  const media = devices ?? (typeof navigator === "undefined" ? null : navigator.mediaDevices);
  if (!media) return run();
  const original = media.getUserMedia.bind(media);
  let handedOff = false;
  media.getUserMedia = ((constraints?: MediaStreamConstraints) => {
    if (!handedOff) {
      handedOff = true;
      return streamPromise;
    }
    return original(constraints ?? GESTURE_CAMERA_CONSTRAINTS);
  }) as MediaDevices["getUserMedia"];
  try {
    return await run();
  } finally {
    media.getUserMedia = original;
  }
}
