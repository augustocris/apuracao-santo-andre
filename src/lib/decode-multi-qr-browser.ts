import {
  canvasToJpegFile,
  copyVideoFrameToCanvas,
} from "@/lib/live-frame-scan";
import {
  hasFirstOrZonaQr,
  preferFirstOrZonaQr,
  stackedQrCropRects,
  type QrCropRect,
} from "@/lib/decode-multi-qr";

type ScanFileFn = (file: File) => Promise<string | null>;

async function detectWithBarcodeDetector(
  source: ImageBitmapSource
): Promise<string[]> {
  const Detector = (
    globalThis as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
      };
    }
  ).BarcodeDetector;
  if (!Detector) return [];
  try {
    const detector = new Detector({ formats: ["qr_code"] });
    const codes = await detector.detect(source);
    return codes.map((c) => String(c.rawValue ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function cropToCanvas(
  source: CanvasImageSource,
  rect: QrCropRect
): HTMLCanvasElement | null {
  if (rect.width < 40 || rect.height < 40) return null;
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );
  return canvas;
}

async function scanCanvas(
  canvas: HTMLCanvasElement,
  scanFile: ScanFileFn,
  name: string
): Promise<string[]> {
  const found = await detectWithBarcodeDetector(canvas);
  if (found.length > 0) return found;
  const file = await canvasToJpegFile(canvas, name);
  if (!file) return [];
  try {
    const text = await scanFile(file);
    return text?.trim() ? [text] : [];
  } catch {
    return [];
  }
}

export async function decodeAllQrsFromCanvas(
  canvas: HTMLCanvasElement,
  scanFile: ScanFileFn,
  mode: "all" | "prefer-first" = "all"
): Promise<string[]> {
  const texts = await detectWithBarcodeDetector(canvas);
  let collected = preferFirstOrZonaQr(texts);
  if (mode === "prefer-first" && hasFirstOrZonaQr(collected)) {
    return collected;
  }

  const rects = stackedQrCropRects(canvas.width, canvas.height).filter((rect) => {
    if (mode === "all") return true;
    if (hasFirstOrZonaQr(collected)) return false;
    return rect.id === "top" || rect.id === "topInset" || rect.id === "topHalf";
  });

  for (const rect of rects) {
    if (rect.id === "full" && texts.length > 0) continue;
    const crop = rect.id === "full" ? canvas : cropToCanvas(canvas, rect);
    if (!crop) continue;
    const extra = await scanCanvas(crop, scanFile, `bu-${rect.id}.jpg`);
    collected = preferFirstOrZonaQr([...collected, ...extra]);
    if (mode === "prefer-first" && hasFirstOrZonaQr(collected)) break;
  }
  return collected;
}

export async function decodeAllQrsFromFile(
  file: File,
  scanFile: ScanFileFn
): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    const fallback = await scanFile(file);
    return preferFirstOrZonaQr(fallback ? [fallback] : []);
  }
  ctx.drawImage(bitmap, 0, 0);
  const fromCanvas = await decodeAllQrsFromCanvas(canvas, scanFile, "all");
  if (fromCanvas.length > 0) return fromCanvas;
  const fallback = await scanFile(file);
  return preferFirstOrZonaQr(fallback ? [fallback] : []);
}

export async function decodeAllQrsFromVideo(
  video: HTMLVideoElement,
  scanFile: ScanFileFn,
  mode: "all" | "prefer-first" = "prefer-first"
): Promise<string[]> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const copied = copyVideoFrameToCanvas(video, canvas, (dw, dh) => {
    ctx.drawImage(video, 0, 0, dw, dh);
  });
  if (!copied) return [];
  return decodeAllQrsFromCanvas(canvas, scanFile, mode);
}
