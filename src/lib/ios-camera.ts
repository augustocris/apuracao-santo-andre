/** iPhone / iPad (incl. iPadOS that spoofs MacIntel). */
export function isAppleTouchDevice(ua = "", maxTouchPoints = 0): boolean {
  if (/iP(hone|od|ad)/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return false;
}

export function currentAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isAppleTouchDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/**
 * iOS Safari often rejects min:1280 / exact 1920.
 * First attempt is facingMode only; Android may then try ideal 1920 (no min).
 */
export function cameraConstraintLadder(appleTouch: boolean): MediaTrackConstraints[] {
  const environment: MediaTrackConstraints = { facingMode: "environment" };
  const environmentIdeal: MediaTrackConstraints = {
    facingMode: { ideal: "environment" },
  };
  if (appleTouch) {
    return [environment, environmentIdeal];
  }
  return [
    {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    environmentIdeal,
    environment,
  ];
}

export function useBarcodeDetector(appleTouch: boolean): boolean {
  return !appleTouch;
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
