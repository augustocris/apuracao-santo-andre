import { getSupabase } from "@/lib/supabase";

const BUCKET = "candidatos";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (matches storage policy)
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/**
 * Compress / resize an image client-side before upload.
 * Returns a Blob suitable for Supabase Storage (JPEG when canvas-backed).
 */
export async function prepareCandidatePhoto(file: File): Promise<{
  blob: Blob;
  contentType: string;
  ext: string;
}> {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Use JPEG, PNG, WebP ou GIF.");
  }
  if (file.size > MAX_BYTES * 3) {
    throw new Error("Arquivo muito grande (máx. ~6 MB antes da compressão).");
  }

  // Small enough already — upload as-is
  if (file.size <= MAX_BYTES && file.type !== "image/gif") {
    // Still downscale huge dimensions for TV cards
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 900;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    if (file.size <= MAX_BYTES) {
      return {
        blob: file,
        contentType: file.type,
        ext: extensionFor(file.type),
      };
    }
    throw new Error("Não foi possível processar a imagem.");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao comprimir a foto."))),
      "image/jpeg",
      0.85
    );
  });

  if (blob.size > MAX_BYTES) {
    throw new Error("Foto ainda grande demais após compressão (máx. 2 MB).");
  }

  return { blob, contentType: "image/jpeg", ext: "jpg" };
}

/**
 * Upload candidate photo to Supabase Storage bucket `candidatos`.
 * Returns the public URL. Falls back to a size-limited data URL in mock mode.
 */
export async function uploadCandidatoFoto(
  file: File,
  opts?: { candidatoId?: string; numero?: string }
): Promise<string> {
  const prepared = await prepareCandidatePhoto(file);
  const supabase = getSupabase();

  if (!supabase) {
    // Mock / local: persist as data URL (capped)
    if (prepared.blob.size > 400_000) {
      throw new Error(
        "No modo MOCK a foto precisa ficar abaixo de ~400 KB. Configure o Supabase Storage ou use uma URL pública."
      );
    }
    const dataUrl = await blobToDataUrl(prepared.blob);
    return dataUrl;
  }

  const idPart =
    opts?.candidatoId?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36) ||
    opts?.numero?.replace(/\D/g, "") ||
    "novo";
  const path = `${idPart}-${Date.now()}.${prepared.ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.blob, {
      contentType: prepared.contentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(
      `Falha no upload Storage (${error.message}). Confira se o bucket "candidatos" existe (migration 003) ou cole uma URL pública.`
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Upload ok, mas a URL pública não foi gerada.");
  }
  return data.publicUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

export function isProbablyImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
