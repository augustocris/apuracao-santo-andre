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

/**
 * First try is always `{ facingMode: "environment" }` — no min, no 1920.
 * Same first shot on Android and iPhone. Fallbacks only if that getUserMedia fails.
 */
export function cameraStartAttempts(_appleTouch: boolean): CameraStartAttempt[] {
  return [
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
}

/** @deprecated use cameraStartAttempts — kept for tests that check the first getUserMedia. */
export function cameraConstraintLadder(appleTouch: boolean): MediaTrackConstraints[] {
  return cameraStartAttempts(appleTouch).map((a) => a.videoConstraints ?? a.cameraIdOrConfig);
}

export function liveScanConfig(appleTouch: boolean): {
  fps: number;
  disableFlip: true;
} {
  return {
    fps: appleTouch ? 8 : 12,
    disableFlip: true,
  };
}

export function useBarcodeDetector(appleTouch: boolean): boolean {
  return !appleTouch;
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
