"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, Download, MessageCircle, Share2 } from "lucide-react";
import { WhatsAppSupport } from "@/components/fiscal/FiscalFeedback";
import { Button } from "@/components/ui/button";
import { cameraFeedback, type FiscalFeedback } from "@/lib/fiscal-feedback";
import {
  ANDROID_IDEAL_VIDEO,
  cameraErrorKind,
  cameraStartAttempts,
  currentAppleTouchDevice,
  hardenLiveVideo,
  liveScanConfig,
  NEXT_QR_IGNORE_MS,
  qrboxForDenseTse,
  requestCameraFromUserGesture,
  revealLiveScannerElement,
  shouldAcceptLiveDecode,
  useBarcodeDetector,
  waitForScannerSurface,
  watchAndHardenLiveVideo,
  withPrefetchedMediaStream,
} from "@/lib/ios-camera";
import { sameQrPayload } from "@/lib/parser/bu-qr";
import {
  shareBuPhoto,
  whatsappFallbackHref,
} from "@/lib/whatsapp-share";

interface BuScannerProps {
  onScan: (text: string) => void;
  busy?: boolean;
  /** Increment to allow another decode after the previous one. */
  resetKey?: number;
  nextQr?: boolean;
  /** Exact payloads already accepted (QR 1). Leftover frames must not fire again. */
  ignoreExactPayloads?: string[];
  /** Keep the live session across QR 2+ (do not stop the camera). */
  keepOpen?: boolean;
  whatsapp?: string | null;
  onCameraError?: (error: FiscalFeedback) => void;
}

function mapCameraError(err: unknown, appleTouch: boolean): string {
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext;
  const kind = cameraErrorKind(err, { secureContext });

  if (kind === "https") {
    return appleTouch
      ? "No iPhone a câmera só abre em HTTPS. Use o site seguro ou mande foto no WhatsApp."
      : "A câmera só funciona em HTTPS (ou localhost). Abra o site seguro ou mande foto no WhatsApp.";
  }
  if (kind === "permission") {
    return "Câmera bloqueada. Mande foto no WhatsApp.";
  }
  if (kind === "notfound") {
    return "Nenhuma câmera encontrada. Mande foto no WhatsApp.";
  }
  if (kind === "inuse") {
    return "A câmera está em uso por outro app. Feche-o e tente de novo, ou mande foto no WhatsApp.";
  }
  if (kind === "overconstrained") {
    return "Este aparelho não aceitou o modo da câmera. Tente de novo ou mande foto no WhatsApp.";
  }
  return "Não deu para abrir a câmera. Tente de novo ou mande foto no WhatsApp.";
}

function readerRoot(): HTMLElement | null {
  return document.getElementById("bu-qr-reader");
}

function stopVideoTracks(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll("video").forEach((video) => {
    const stream = video.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
    }
    video.srcObject = null;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
  });
}

function waitForLiveVideo(root: HTMLElement | null, timeoutMs = 2500): Promise<void> {
  if (!root) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const video = root.querySelector("video");
      const stream = video?.srcObject;
      const tracksLive =
        stream instanceof MediaStream &&
        stream.getVideoTracks().some((t) => t.readyState === "live");
      const playing =
        !!video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        !video.paused &&
        tracksLive;
      if (playing || Date.now() - started > timeoutMs) {
        resolve();
        return;
      }
      if (typeof requestAnimationFrame === "undefined") {
        setTimeout(tick, 50);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function clearScannerDecodedCache(scanner: Html5Qrcode | null) {
  if (!scanner) return;
  const loose = scanner as unknown as {
    lastMatchFound?: string;
    lastDecodedText?: string;
  };
  loose.lastMatchFound = undefined;
  loose.lastDecodedText = undefined;
}

export function BuScanner({
  onScan,
  busy,
  resetKey = 0,
  nextQr = false,
  ignoreExactPayloads = [],
  keepOpen = false,
  whatsapp,
  onCameraError,
}: BuScannerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{
    url: string;
    file: File;
  } | null>(null);
  const [photoBusyLabel, setPhotoBusyLabel] = useState<string | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const sessionLiveRef = useRef(false);
  const ignoreUntilRef = useRef(0);
  const ignorePayloadsRef = useRef<string[]>([]);
  ignorePayloadsRef.current = ignoreExactPayloads;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const unwatchVideoRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const pendingDecodeRef = useRef<string | null>(null);
  const keepOpenRef = useRef(keepOpen);
  keepOpenRef.current = keepOpen;
  const appleTouch = currentAppleTouchDevice();
  const barcodeDetector = useBarcodeDetector(appleTouch);

  useEffect(() => {
    return () => {
      void stopScanner();
      if (pendingPhoto?.url) URL.revokeObjectURL(pendingPhoto.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teardown on unmount only
  }, []);

  useEffect(() => {
    const releaseIfHidden = () => {
      if (typeof document !== "undefined" && document.hidden) {
        void stopScanner();
      }
    };
    const onPageHide = () => {
      void stopScanner();
    };
    document.addEventListener("visibilitychange", releaseIfHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", releaseIfHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once; stopScanner is stable enough
  }, []);

  useEffect(() => {
    handledRef.current = false;
    if (nextQr) {
      ignoreUntilRef.current = Date.now() + NEXT_QR_IGNORE_MS;
    }
    const timer = window.setTimeout(() => {
      if (sessionLiveRef.current && !handledRef.current) {
        flushPendingDecode();
      }
    }, nextQr ? NEXT_QR_IGNORE_MS + 20 : 0);
    return () => window.clearTimeout(timer);
  }, [resetKey, nextQr]);

  useEffect(() => {
    if (!busy && sessionLiveRef.current) {
      flushPendingDecode();
    }
    // flushPendingDecode is stable enough for the busy edge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function stopScanner() {
    sessionLiveRef.current = false;
    ignoreUntilRef.current = 0;
    unwatchVideoRef.current?.();
    unwatchVideoRef.current = null;
    const root = readerRoot();
    stopVideoTracks(root);
    const scanner = scannerRef.current;
    scannerRef.current = null;
    clearScannerDecodedCache(scanner);
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch {
        /* ignore stop race */
      }
    }
    try {
      scanner?.clear();
    } catch {
      /* ignore */
    }
    clearScannerDecodedCache(scanner);
    stopVideoTracks(root);
    if (root) root.innerHTML = "";
    setActive(false);
  }

  function flushPendingDecode() {
    const pending = pendingDecodeRef.current;
    if (!pending) return;
    pendingDecodeRef.current = null;
    deliverScan(pending);
  }

  function deliverScan(text: string, fromPhoto = false) {
    if (
      !shouldAcceptLiveDecode({
        fromPhoto,
        handled: handledRef.current,
        busy: Boolean(busy),
        sessionLive: sessionLiveRef.current,
        ignoreUntil: ignoreUntilRef.current,
        now: Date.now(),
      })
    ) {
      if (!fromPhoto && !handledRef.current) {
        pendingDecodeRef.current = text;
      }
      return;
    }
    if (ignorePayloadsRef.current.some((prev) => sameQrPayload(prev, text))) {
      return;
    }
    handledRef.current = true;
    pendingDecodeRef.current = null;
    if (!keepOpenRef.current) {
      sessionLiveRef.current = false;
      void stopScanner();
    }
    onScan(text);
  }

  function showCameraError(cause: string) {
    setError(cause);
    onCameraError?.(cameraFeedback(cause));
  }

  function scannerFactory(elementId: string) {
    return new Html5Qrcode(elementId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: barcodeDetector,
      },
      useBarCodeDetectorIfSupported: barcodeDetector,
    });
  }

  async function startWithAttempt(
    scanner: Html5Qrcode,
    attempt: ReturnType<typeof cameraStartAttempts>[number]
  ) {
    await scanner.start(
      attempt.cameraIdOrConfig,
      {
        ...liveScanConfig(appleTouch),
        qrbox: qrboxForDenseTse,
        ...(attempt.videoConstraints
          ? { videoConstraints: attempt.videoConstraints }
          : {}),
      },
      (decoded) => deliverScan(decoded),
      () => undefined
    );
    hardenLiveVideo(readerRoot());
  }

  /**
   * Must stay synchronous until getUserMedia is invoked. Any await/setState/rAF
   * before that call drops the iOS user-gesture and the camera never opens.
   */
  function handleFilmarClick() {
    if (busy || uploading || startingRef.current || active) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      showCameraError(
        mapCameraError(new Error("Only secure origins are allowed"), appleTouch)
      );
      return;
    }
    startingRef.current = true;
    handledRef.current = false;
    sessionLiveRef.current = false;
    // Visible + sized before getUserMedia — still inside the click/touch.
    revealLiveScannerElement(readerRoot());
    setActive(true);
    // First statement that talks to the camera — still inside the click/touch.
    const streamPromise = requestCameraFromUserGesture();
    void attachScanner(streamPromise);
  }

  async function attachScanner(streamPromise: Promise<MediaStream>) {
    setError(null);
    setActive(true);
    revealLiveScannerElement(readerRoot());
    let handedStream: MediaStream | null = null;
    try {
      handedStream = await streamPromise;
      await waitForScannerSurface(readerRoot());
      revealLiveScannerElement(readerRoot());

      const scanner = scannerFactory("bu-qr-reader");
      scannerRef.current = scanner;
      clearScannerDecodedCache(scanner);
      unwatchVideoRef.current?.();
      unwatchVideoRef.current = watchAndHardenLiveVideo(readerRoot());

      const attempts = cameraStartAttempts(appleTouch);
      let lastErr: unknown;
      try {
        await withPrefetchedMediaStream(Promise.resolve(handedStream), () =>
          startWithAttempt(scanner, attempts[0])
        );
        handedStream = null;
        lastErr = null;
      } catch (err) {
        lastErr = err;
        if (cameraErrorKind(err) === "permission") throw err;
        handedStream?.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            /* ignore */
          }
        });
        handedStream = null;
      }

      if (lastErr) {
        for (const attempt of attempts.slice(1)) {
          try {
            if (scanner.isScanning) {
              try {
                await scanner.stop();
              } catch {
                /* ignore */
              }
            }
            await startWithAttempt(scanner, attempt);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
      }
      if (lastErr) throw lastErr;

      if (!appleTouch) {
        try {
          await scanner.applyVideoConstraints(ANDROID_IDEAL_VIDEO);
        } catch {
          /* some Androids reject 1920 — keep the stream that already started */
        }
      }

      const root = readerRoot();
      revealLiveScannerElement(root);
      hardenLiveVideo(root);
      sessionLiveRef.current = true;
      ignoreUntilRef.current = nextQr ? Date.now() + NEXT_QR_IGNORE_MS : 0;
      flushPendingDecode();
      await waitForLiveVideo(root);
      hardenLiveVideo(root);
      clearScannerDecodedCache(scanner);
      if (!sessionLiveRef.current) {
        sessionLiveRef.current = true;
      }
      flushPendingDecode();
    } catch (err) {
      sessionLiveRef.current = false;
      handedStream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      await stopScanner();
      showCameraError(mapCameraError(err, appleTouch));
    } finally {
      startingRef.current = false;
    }
  }

  async function decodeQrFromPhoto(file: File): Promise<string> {
    const scanner = scannerFactory("bu-qr-file-reader");
    try {
      return await scanner.scanFile(file, false);
    } finally {
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
  }

  async function handlePhotoOfQr(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setUploading(true);
    setPhotoBusyLabel("Lendo foto…");
    try {
      await stopScanner();
      const text = await decodeQrFromPhoto(file);
      if (!text.trim()) throw new Error("empty qr");
      deliverScan(text, true);
    } catch {
      setError(
        "Não deu para ler o QR nesta foto. Tente outra foto mais perto, ou mande no WhatsApp."
      );
    } finally {
      setUploading(false);
      setPhotoBusyLabel(null);
      if (qrFileInputRef.current) qrFileInputRef.current.value = "";
    }
  }

  async function handlePhotoForWhatsApp(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setUploading(true);
    try {
      await stopScanner();
      const result = await shareBuPhoto(file, whatsapp);
      if (result === "fallback") {
        setPendingPhoto((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(file), file };
        });
      } else {
        setPendingPhoto((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return null;
        });
      }
    } catch {
      setPendingPhoto((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(file), file };
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function retryShare() {
    if (!pendingPhoto || busy) return;
    setUploading(true);
    try {
      const result = await shareBuPhoto(pendingPhoto.file, whatsapp);
      if (result !== "fallback") {
        URL.revokeObjectURL(pendingPhoto.url);
        setPendingPhoto(null);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        id="bu-qr-reader"
        className={`w-full overflow-hidden rounded-2xl border-2 border-teal-700/30 bg-slate-900/5 ${
          active ? "block min-h-[70vh] max-h-[70vh]" : "hidden"
        }`}
      />

      {active ? (
        <p className="text-center text-base font-bold text-teal-900">
          Aponte o QR da BU. A leitura é contínua.
        </p>
      ) : null}

      {!active && (
        <Button
          type="button"
          size="lg"
          className="h-16 w-full text-lg font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md"
          onClick={handleFilmarClick}
          disabled={busy || uploading}
        >
          <Camera className="size-6" />
          {nextQr ? "Filmar o próximo QR" : "Filmar o QR"}
        </Button>
      )}

      {active && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 w-full border-2 border-slate-400 text-base font-semibold"
          onClick={() => void stopScanner()}
        >
          <CameraOff className="size-5" />
          Parar câmera
        </Button>
      )}

      <div id="bu-qr-file-reader" className="h-px w-px overflow-hidden" />

      <label className="block">
        <input
          ref={qrFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => void handlePhotoOfQr(e.target.files?.[0])}
        />
        <span
          className={`inline-flex h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-teal-800 bg-teal-700 text-base font-bold text-white hover:bg-teal-800 ${
            busy || uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Camera className="size-5" />
          {photoBusyLabel ?? "Foto do QR"}
        </span>
      </label>

      <label className="block">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => void handlePhotoForWhatsApp(e.target.files?.[0])}
        />
        <span
          className={`inline-flex h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-teal-700/40 bg-white text-base font-bold text-teal-900 hover:bg-teal-50 ${
            busy || uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <MessageCircle className="size-5" />
          {uploading && !photoBusyLabel
            ? "Abrindo WhatsApp…"
            : "Deu erro? Foto no WhatsApp"}
        </span>
      </label>

      {pendingPhoto ? (
        <div
          role="status"
          className="space-y-2 rounded-xl border-2 border-teal-700/30 bg-teal-50 px-3 py-3 text-teal-950"
        >
          <p className="text-sm font-semibold">
            Foto pronta. Compartilhe no WhatsApp da central — não é leitura de QR.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 w-full bg-teal-700 text-white hover:bg-teal-800"
              onClick={() => void retryShare()}
              disabled={uploading}
            >
              <Share2 className="size-4" />
              Compartilhar
            </Button>
            <a
              href={pendingPhoto.url}
              download={pendingPhoto.file.name || "bu-santo-andre.jpg"}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-slate-300 bg-white text-sm font-semibold text-slate-800"
            >
              <Download className="size-4" />
              Baixar foto
            </a>
            {whatsappFallbackHref(whatsapp) ? (
              <a
                href={whatsappFallbackHref(whatsapp)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-teal-700/40 bg-white text-sm font-bold text-teal-900"
              >
                <MessageCircle className="size-4" />
                Abrir WhatsApp da central
              </a>
            ) : (
              <WhatsAppSupport number={whatsapp} className="text-sm text-teal-950" />
            )}
          </div>
        </div>
      ) : null}

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-amber-500/40 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <p>{error}</p>
          <WhatsAppSupport number={whatsapp} className="mt-2 text-sm text-amber-950" />
        </div>
      )}
    </div>
  );
}
