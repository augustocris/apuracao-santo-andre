"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BuScannerProps {
  onScan: (text: string) => void;
  busy?: boolean;
}

function mapCameraError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";

  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "A câmera só funciona em HTTPS (ou localhost). Abra o site seguro ou use Digitar / Enviar foto.";
  }
  if (/NotAllowedError|Permission|denied/i.test(`${name} ${message}`)) {
    return "Permissão de câmera negada. Libere o acesso nas configurações do navegador ou use Digitar / Enviar foto do QR.";
  }
  if (/NotFoundError|DevicesNotFound|Requested device not found/i.test(`${name} ${message}`)) {
    return "Nenhuma câmera encontrada neste dispositivo. Use Digitar ou Enviar foto do QR.";
  }
  if (/NotReadableError|TrackStartError|Could not start video/i.test(`${name} ${message}`)) {
    return "A câmera está em uso por outro app. Feche-o e tente de novo, ou use Digitar / Enviar foto.";
  }
  if (/OverconstrainedError|Constraint/i.test(`${name} ${message}`)) {
    return "Este aparelho não aceitou a resolução pedida. Tente de novo ou use Enviar foto do QR.";
  }
  if (/secure|https|Only secure origins/i.test(message)) {
    return "A câmera exige conexão segura (HTTPS). Use Digitar ou Enviar foto do QR.";
  }
  return "Erro ao iniciar a câmera. Tente novamente, envie uma foto do QR ou use a aba Digitar.";
}

/** Prefer almost full-frame scan — dense TSE BUs need the whole code sharp in view. */
function qrboxForViewfinder(viewfinderWidth: number, viewfinderHeight: number) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.max(280, Math.floor(minEdge * 0.92));
  return {
    width: Math.min(size, viewfinderWidth),
    height: Math.min(size, viewfinderHeight),
  };
}

const HIGH_RES_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { min: 1280, ideal: 1920 },
  height: { min: 720, ideal: 1080 },
};

const FALLBACK_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
};

/** Continuous autofocus when the browser exposes the constraint. */
const FOCUS_CONSTRAINTS = {
  advanced: [{ focusMode: "continuous" }],
} as unknown as MediaTrackConstraints;

export function BuScanner({ onScan, busy }: BuScannerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  async function stopScanner() {
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

  async function startWithConstraints(
    scanner: Html5Qrcode,
    videoConstraints: MediaTrackConstraints
  ) {
    await scanner.start(
      videoConstraints,
      {
        fps: 12,
        qrbox: qrboxForViewfinder,
        aspectRatio: 1.777778,
        disableFlip: true,
        videoConstraints,
      },
      (decoded) => deliverScan(decoded),
      () => undefined
    );
  }

  async function startScanner() {
    setError(null);
    handledRef.current = false;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(mapCameraError(new Error("Only secure origins are allowed")));
      return;
    }

    try {
      await stopScanner();
      const scanner = new Html5Qrcode("bu-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;
      setActive(true);

      try {
        await startWithConstraints(scanner, HIGH_RES_CONSTRAINTS);
      } catch (highResErr) {
        // Some devices reject min:1280 — retry with facingMode only.
        if (scanner.isScanning) {
          try {
            await scanner.stop();
          } catch {
            /* ignore */
          }
        }
        await startWithConstraints(scanner, FALLBACK_CONSTRAINTS);
        void highResErr;
      }

      // Best-effort continuous focus after stream is live.
      try {
        await scanner.applyVideoConstraints(FOCUS_CONSTRAINTS);
      } catch {
        /* focus not supported — ok */
      }
    } catch (err) {
      setActive(false);
      setError(mapCameraError(err));
    }
  }

  async function handleFilePick(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setUploading(true);
    handledRef.current = false;
    try {
      await stopScanner();
      const scanner = new Html5Qrcode("bu-qr-reader-file", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        useBarCodeDetectorIfSupported: true,
      });
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
      setError(
        "Não foi possível ler o QR nesta foto. Tire outra com boa luz, QR preenchendo o quadro, ou use a aba Digitar."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-teal-700/25 bg-teal-50/80 px-3 py-2.5 text-[11px] leading-snug text-teal-950 sm:text-xs"
        role="note"
      >
        <p className="font-semibold">Dica para QRs densos do BU</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-teal-900/90">
          <li>Segure o celular firme, com boa luz, e preencha o quadro com o QR.</li>
          <li>
            Se o QR estiver no monitor, afaste um pouco (reduz reflexo) ou use{" "}
            <strong className="font-semibold">Enviar foto</strong> /{" "}
            <strong className="font-semibold">Digitar</strong>.
          </li>
        </ul>
      </div>

      <div
        id="bu-qr-reader"
        className={`overflow-hidden rounded-2xl border-2 border-teal-700/30 bg-slate-900/5 ${
          active ? "min-h-[320px] sm:min-h-[380px]" : "hidden"
        }`}
      />
      {/* Hidden host for file-based decode (html5-qrcode needs a DOM id). */}
      <div id="bu-qr-reader-file" className="hidden" aria-hidden />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFilePick(e.target.files?.[0])}
      />

      {!active && (
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-md sm:h-16 sm:text-lg"
          onClick={() => void startScanner()}
          disabled={busy || uploading}
        >
          <Camera className="size-5 sm:size-6" />
          Escanear Boletim de Urna (BU)
        </Button>
      )}

      {active && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full border-2 border-slate-400 text-sm sm:h-14 sm:text-base"
          onClick={() => void stopScanner()}
        >
          <CameraOff className="size-5" />
          Parar câmera
        </Button>
      )}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full border-2 border-teal-700/40 text-sm font-semibold text-teal-900 hover:bg-teal-50 sm:h-14 sm:text-base"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy || uploading}
      >
        <ImageUp className="size-5" />
        {uploading ? "Lendo foto…" : "Enviar foto do QR"}
      </Button>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          {error}
        </p>
      )}
    </div>
  );
}
