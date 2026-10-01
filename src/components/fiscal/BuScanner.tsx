"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { WhatsAppSupport } from "@/components/fiscal/FiscalFeedback";
import { Button } from "@/components/ui/button";
import { cameraFeedback, type FiscalFeedback } from "@/lib/fiscal-feedback";
import {
  cameraErrorKind,
  cameraStartAttempts,
  currentAppleTouchDevice,
  hardenLiveVideo,
  liveScanConfig,
  useBarcodeDetector,
  watchAndHardenLiveVideo,
} from "@/lib/ios-camera";

interface BuScannerProps {
  onScan: (text: string) => void;
  busy?: boolean;
  /** Increment to allow another decode after the previous one. */
  resetKey?: number;
  nextQr?: boolean;
  whatsapp?: string | null;
  onCameraError?: (error: FiscalFeedback) => void;
}

function mapCameraError(err: unknown, appleTouch: boolean): string {
  const secureContext = typeof window === "undefined" ? true : window.isSecureContext;
  const kind = cameraErrorKind(err, { secureContext });

  if (kind === "https") {
    return appleTouch
      ? "No iPhone a câmera só abre em HTTPS. Use o site seguro ou mande uma foto do QR."
      : "A câmera só funciona em HTTPS (ou localhost). Abra o site seguro ou envie uma foto do QR.";
  }
  if (kind === "permission") {
    return appleTouch
      ? "O Safari bloqueou a câmera. Ajustes → Safari → Câmera → Permitir, ou mande uma foto do QR."
      : "Permissão de câmera negada. Libere o acesso nas configurações do navegador ou envie uma foto do QR.";
  }
  if (kind === "notfound") {
    return "Nenhuma câmera encontrada. Mande uma foto do QR.";
  }
  if (kind === "inuse") {
    return "A câmera está em uso por outro app. Feche-o e tente de novo, ou mande uma foto do QR.";
  }
  if (kind === "overconstrained") {
    return "Este aparelho não aceitou o modo da câmera. Tente de novo ou mande uma foto do QR.";
  }
  return "Não deu para abrir a câmera. Tente de novo ou mande uma foto do QR.";
}

/** Almost full-frame — dense TSE BUs need the whole code sharp. */
function qrboxForViewfinder(viewfinderWidth: number, viewfinderHeight: number) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  if (!Number.isFinite(minEdge) || minEdge < 50) {
    return { width: 240, height: 240 };
  }
  const size = Math.max(240, Math.floor(minEdge * 0.9));
  return {
    width: Math.min(size, viewfinderWidth),
    height: Math.min(size, viewfinderHeight),
  };
}

function waitForReaderLayout(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const FOCUS_CONSTRAINTS = {
  advanced: [{ focusMode: "continuous" }],
} as unknown as MediaTrackConstraints;

export function BuScanner({
  onScan,
  busy,
  resetKey = 0,
  nextQr = false,
  whatsapp,
  onCameraError,
}: BuScannerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const unwatchVideoRef = useRef<(() => void) | null>(null);
  const appleTouch = currentAppleTouchDevice();
  const barcodeDetector = useBarcodeDetector(appleTouch);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  useEffect(() => {
    handledRef.current = false;
  }, [resetKey]);

  async function stopScanner() {
    unwatchVideoRef.current?.();
    unwatchVideoRef.current = null;
    const scanner = scannerRef.current;
    scannerRef.current = null;
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
    setActive(false);
  }

  function deliverScan(text: string) {
    if (handledRef.current || busy) return;
    handledRef.current = true;
    void stopScanner();
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
        qrbox: qrboxForViewfinder,
        ...(attempt.videoConstraints
          ? { videoConstraints: attempt.videoConstraints }
          : {}),
      },
      (decoded) => deliverScan(decoded),
      () => undefined
    );
    hardenLiveVideo(document.getElementById("bu-qr-reader"));
  }

  async function startScanner() {
    setError(null);
    handledRef.current = false;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      showCameraError(mapCameraError(new Error("Only secure origins are allowed"), appleTouch));
      return;
    }

    try {
      await stopScanner();
      setActive(true);
      await waitForReaderLayout();

      const scanner = scannerFactory("bu-qr-reader");
      scannerRef.current = scanner;
      unwatchVideoRef.current?.();
      unwatchVideoRef.current = watchAndHardenLiveVideo(
        document.getElementById("bu-qr-reader")
      );

      const attempts = cameraStartAttempts(appleTouch);
      let lastErr: unknown;
      for (const attempt of attempts) {
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
      if (lastErr) throw lastErr;

      try {
        await scanner.applyVideoConstraints(FOCUS_CONSTRAINTS);
      } catch {
        /* focus not supported — ok, especially on iOS */
      }
      hardenLiveVideo(document.getElementById("bu-qr-reader"));
    } catch (err) {
      setActive(false);
      showCameraError(mapCameraError(err, appleTouch));
    }
  }

  async function handleFilePick(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setUploading(true);
    handledRef.current = false;
    try {
      await stopScanner();
      const scanner = scannerFactory("bu-qr-reader-file");
      try {
        const result = await scanner.scanFileV2(file, false);
        const text = result.decodedText?.trim();
        if (!text) {
          throw new Error("QR vazio");
        }
        onScan(text);
      } finally {
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
      }
    } catch {
      showCameraError(
        "Não leu o QR nesta foto. Outra com boa luz, QR preenchendo o quadro."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl border-2 border-teal-700/30 bg-teal-50 px-4 py-3 text-teal-950"
        role="note"
      >
        <p className="text-base font-bold leading-snug">Filme o QR do BU.</p>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          Se tiver 2 códigos, filme os dois.
        </p>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          Verde = enviada. Próxima urna.
        </p>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          Se falhar: leia de novo ou foto no WhatsApp da central.
        </p>
      </div>

      <div
        id="bu-qr-reader"
        className={`overflow-hidden rounded-2xl border-2 border-teal-700/30 bg-slate-900/5 ${
          active ? "min-h-[320px] sm:min-h-[380px]" : "hidden"
        }`}
      />
      <div id="bu-qr-reader-file" className="hidden" aria-hidden />

      {!active && (
        <Button
          type="button"
          size="lg"
          className="h-16 w-full text-lg font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md"
          onClick={() => void startScanner()}
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

      <label className="block">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => void handleFilePick(e.target.files?.[0])}
        />
        <span
          className={`inline-flex h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-teal-700/40 bg-white text-base font-bold text-teal-900 hover:bg-teal-50 ${
            busy || uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <ImageUp className="size-5" />
          {uploading ? "Lendo foto…" : "Foto do QR"}
        </span>
      </label>

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
