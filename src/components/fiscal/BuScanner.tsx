"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BuScannerProps {
  onScan: (text: string) => void;
  busy?: boolean;
}

export function BuScanner({ onScan, busy }: BuScannerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setActive(false);
  }

  async function startScanner() {
    setError(null);
    handledRef.current = false;
    try {
      await stopScanner();
      const scanner = new Html5Qrcode("bu-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      setActive(true);

      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          if (handledRef.current || busy) return;
          handledRef.current = true;
          void stopScanner();
          onScan(decoded);
        },
        () => undefined
      );
    } catch (err) {
      setActive(false);
      const message =
        err instanceof Error ? err.message : "Não foi possível abrir a câmera.";
      if (/NotAllowedError|Permission/i.test(message)) {
        setError(
          "Permissão de câmera negada. Libere o acesso ou use a aba Colar Texto."
        );
      } else if (/NotFoundError|DevicesNotFound/i.test(message)) {
        setError("Nenhuma câmera encontrada neste dispositivo.");
      } else {
        setError(
          "Erro ao iniciar a câmera. Tente novamente ou cole o texto do BU."
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      <div
        id="bu-qr-reader"
        className={`overflow-hidden rounded-2xl border-2 border-teal-700/30 bg-slate-900/5 ${
          active ? "min-h-[280px]" : "hidden"
        }`}
      />

      {!active && (
        <Button
          type="button"
          size="lg"
          className="h-16 w-full text-lg font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-md"
          onClick={() => void startScanner()}
          disabled={busy}
        >
          <Camera className="size-6" />
          Escanear Boletim de Urna (BU)
        </Button>
      )}

      {active && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 w-full border-2 border-slate-400 text-base"
          onClick={() => void stopScanner()}
        >
          <CameraOff className="size-5" />
          Parar câmera
        </Button>
      )}

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
