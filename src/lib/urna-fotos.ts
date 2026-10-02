import {
  getSupabase,
  hasSupabaseEnv,
} from "@/lib/supabase";
import { unzip } from "fflate";
import { prepareCandidatePhoto } from "@/lib/candidato-foto";
import { applyCandidatoFotos, listCandidatos } from "@/lib/data";
import type { ChapadaRow } from "@/lib/chapada";
import type { Candidato } from "@/lib/types";
import { normalizeCandidateNumero } from "@/lib/parser/bu-qr";
import { isFeaturedCandidato } from "@/lib/cargos";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const CONCURRENCY = 4;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

export interface UrnaFotoTarget {
  numero: string;
  cargo: string;
  sq_candidato?: string | null;
  origem?: string | null;
  foto_url?: string | null;
  id?: string;
}

export interface UrnaFotoIndex {
  bySq: Map<string, UrnaFotoTarget>;
  byNumero: Map<string, UrnaFotoTarget[]>;
}

export interface UrnaFotoMatch {
  target: UrnaFotoTarget;
  via: "sq" | "numero";
}

export interface UrnaImageEntry {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export interface UrnaFotoProgress {
  done: number;
  total: number;
  uploaded: number;
  skippedCadastro: number;
  unmatched: number;
  ambiguous: number;
  failed: number;
}

export interface UrnaFotoResult {
  uploaded: number;
  skippedCadastro: number;
  unmatched: number;
  ambiguous: number;
  failed: number;
  errors: string[];
  storageConfigured: boolean;
}

function sqKeys(sq: string): string[] {
  const digits = sq.replace(/\D/g, "");
  if (!digits) return [];
  const stripped = digits.replace(/^0+(?=\d)/, "") || digits;
  return stripped === digits ? [digits] : [digits, stripped];
}

export function buildUrnaFotoIndex(rows: UrnaFotoTarget[]): UrnaFotoIndex {
  const bySq = new Map<string, UrnaFotoTarget>();
  const byNumero = new Map<string, UrnaFotoTarget[]>();
  for (const row of rows) {
    if (row.sq_candidato) {
      for (const key of sqKeys(row.sq_candidato)) {
        if (!bySq.has(key)) bySq.set(key, row);
      }
    }
    const n = normalizeCandidateNumero(row.numero);
    if (!n) continue;
    const list = byNumero.get(n) ?? [];
    if (!list.some((x) => x.cargo === row.cargo)) list.push(row);
    byNumero.set(n, list);
  }
  return { bySq, byNumero };
}

export function indexFromChapadaRows(rows: ChapadaRow[]): UrnaFotoIndex {
  return buildUrnaFotoIndex(
    rows.map((r) => ({
      numero: r.numero,
      cargo: r.cargo,
      sq_candidato: r.sq_candidato ?? null,
    }))
  );
}

/** CSV supplies SQ; DB supplies origem/foto so oficiais do telão não são sobrescritos. */
export function mergeUrnaFotoIndexes(
  csv: UrnaFotoIndex,
  db: UrnaFotoIndex
): UrnaFotoIndex {
  const byNumero = new Map(db.byNumero);
  for (const [k, list] of csv.byNumero) {
    const prev = byNumero.get(k) ?? [];
    const merged = prev.map((row) => ({ ...row }));
    for (const row of list) {
      const existing = merged.find((x) => x.cargo === row.cargo);
      if (existing) {
        if (!existing.sq_candidato && row.sq_candidato) {
          existing.sq_candidato = row.sq_candidato;
        }
      } else {
        merged.push({ ...row });
      }
    }
    byNumero.set(k, merged);
  }

  const bySq = new Map<string, UrnaFotoTarget>();
  for (const list of byNumero.values()) {
    for (const row of list) {
      if (!row.sq_candidato) continue;
      for (const key of sqKeys(row.sq_candidato)) {
        bySq.set(key, row);
      }
    }
  }
  for (const [k, row] of db.bySq) {
    if (!bySq.has(k)) bySq.set(k, row);
  }
  for (const [k, row] of csv.bySq) {
    if (!bySq.has(k)) bySq.set(k, row);
  }
  return { bySq, byNumero };
}

/** Basename without extension; ignore folder prefixes and __MACOSX. */
export function urnaFotoBasename(path: string): string {
  const cleaned = path.replace(/\\/g, "/");
  const base = cleaned.split("/").pop() ?? cleaned;
  return base.replace(/\.[^.]+$/, "");
}

export function isUrnaImagePath(path: string): boolean {
  const cleaned = path.replace(/\\/g, "/");
  if (!IMAGE_EXT.test(cleaned)) return false;
  if (cleaned.includes("__MACOSX") || cleaned.endsWith(".DS_Store")) return false;
  const file = cleaned.split("/").pop() ?? "";
  return !file.startsWith(".");
}

/**
 * TSE urna photos: FSP{SQ}_div.jpg (SP), FBR{SQ}_div.jpg (Brasil/Presidente),
 * {SQ}_div.jpg, FSP{SQ}.jpg / FBR{SQ}.jpg (any case).
 * Capture the long digit run — never concatenate leftover digits (year, etc.).
 * Prefix is F + 2-letter UF (`FSP`, `FBR`, …).
 */
const TSE_FOTO_STEM = /^(?:f[a-z]{2})?(\d+)(?:_div)?$/i;
const MAX_NR_CANDIDATO_DIGITS = 5;

export function urnaFotoIdKeys(path: string): string[] {
  const base = urnaFotoBasename(path);
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    for (const k of sqKeys(raw)) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  };

  const explicit = base.match(TSE_FOTO_STEM);
  if (explicit?.[1]) add(explicit[1]);

  const runs = [...base.matchAll(/\d+/g)].map((m) => m[0]);
  runs.sort((a, b) => b.length - a.length);
  for (const run of runs) add(run);

  return keys;
}

export function matchUrnaFotoFilename(
  path: string,
  index: UrnaFotoIndex
): UrnaFotoMatch | { ambiguous: true } | null {
  if (!isUrnaImagePath(path)) return null;
  const keys = urnaFotoIdKeys(path);

  for (const key of keys) {
    const hit = index.bySq.get(key);
    if (hit) return { target: hit, via: "sq" };
  }

  let ambiguous = false;
  for (const key of keys) {
    const numero = normalizeCandidateNumero(key);
    if (!numero || numero.length > MAX_NR_CANDIDATO_DIGITS) continue;
    const list = index.byNumero.get(numero);
    if (!list || list.length === 0) continue;
    if (list.length === 1) return { target: list[0], via: "numero" };
    ambiguous = true;
  }
  if (ambiguous) return { ambiguous: true };
  return null;
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(
      data,
      {
        filter: (file) => isUrnaImagePath(file.name),
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
}

export async function listImagesFromZip(file: File): Promise<UrnaImageEntry[]> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      "ZIP grande demais para processar no navegador (máx. 250 MB). Envie em lotes ou use uma pasta de imagens."
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = await unzipAsync(bytes);
  } catch {
    throw new Error(
      "Não foi possível ler o ZIP. Confira se o arquivo não está corrompido e se as fotos estão em JPG/PNG."
    );
  }
  return Object.entries(unpacked)
    .filter(([name, data]) => isUrnaImagePath(name) && data.byteLength > 0)
    .map(([name, data]) => ({
      name,
      bytes: data,
      type: mimeFromName(name),
    }));
}

export async function listImagesFromFiles(files: File[]): Promise<UrnaImageEntry[]> {
  const images = files.filter((f) => isUrnaImagePath(f.name));
  const entries: UrnaImageEntry[] = [];
  for (const file of images) {
    entries.push({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: file.type || mimeFromName(file.name),
    });
  }
  return entries;
}

const BUCKET = "candidatos";

async function uploadBytesToStorage(
  bytes: Uint8Array,
  filename: string,
  type: string,
  opts: { numero: string; cargo: string; sq?: string | null }
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(
      "Storage não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY e rode a migration 003 (bucket candidatos). A URL da foto só é gravada depois que o upload funciona."
    );
  }

  const file = new File(
    [new Uint8Array(bytes)],
    filename.split("/").pop() || filename,
    {
      type: type || mimeFromName(filename),
    }
  );
  const prepared = await prepareCandidatePhoto(file, { skipCompressIfSmall: true });
  const idPart =
    opts.sq?.replace(/\D/g, "").slice(-16) ||
    `${opts.cargo.replace(/\W+/g, "").slice(0, 8)}-${opts.numero.replace(/\D/g, "")}`;
  const path = `urna/${idPart}-${Date.now()}.${prepared.ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(
      `Falha no upload Storage (${error.message}). Confira o bucket "candidatos" (migration 003).`
    );
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Upload ok, mas a URL pública não foi gerada.");
  }
  return data.publicUrl;
}

function shouldSkipCadastroFoto(target: UrnaFotoTarget): boolean {
  return (
    isFeaturedCandidato(target.origem) &&
    Boolean(target.foto_url && target.foto_url.trim())
  );
}

export async function processUrnaFotos(
  entries: UrnaImageEntry[],
  index: UrnaFotoIndex,
  onProgress?: (p: UrnaFotoProgress) => void
): Promise<UrnaFotoResult> {
  const storageConfigured = hasSupabaseEnv();
  const errors: string[] = [];
  const progress: UrnaFotoProgress = {
    done: 0,
    total: entries.length,
    uploaded: 0,
    skippedCadastro: 0,
    unmatched: 0,
    ambiguous: 0,
    failed: 0,
  };

  if (!storageConfigured) {
    // Still count matches so the user sees why nothing was saved.
    for (const entry of entries) {
      const match = matchUrnaFotoFilename(entry.name, index);
      progress.done += 1;
      if (!match) progress.unmatched += 1;
      else if ("ambiguous" in match) progress.ambiguous += 1;
      else if (shouldSkipCadastroFoto(match.target)) progress.skippedCadastro += 1;
    }
    onProgress?.({ ...progress });
    return {
      ...progress,
      errors: [
        "Storage não configurado. Defina as variáveis do Supabase e rode a migration 003 (bucket candidatos). A URL da foto só é gravada depois que o upload funciona.",
      ],
      storageConfigured: false,
    };
  }

  const pendingUrls: Array<{ numero: string; cargo: string; foto_url: string }> =
    [];

  const queue = [...entries];
  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      try {
        const match = matchUrnaFotoFilename(entry.name, index);
        if (!match) {
          progress.unmatched += 1;
        } else if ("ambiguous" in match) {
          progress.ambiguous += 1;
        } else if (shouldSkipCadastroFoto(match.target)) {
          progress.skippedCadastro += 1;
        } else {
          const url = await uploadBytesToStorage(
            entry.bytes,
            entry.name,
            entry.type,
            {
              numero: match.target.numero,
              cargo: match.target.cargo,
              sq: match.target.sq_candidato,
            }
          );
          pendingUrls.push({
            numero: match.target.numero,
            cargo: match.target.cargo,
            foto_url: url,
          });
          progress.uploaded += 1;
        }
      } catch (err) {
        progress.failed += 1;
        if (errors.length < 12) {
          const msg = err instanceof Error ? err.message : "Falha no upload.";
          errors.push(`${entry.name}: ${msg}`);
        }
      } finally {
        progress.done += 1;
        onProgress?.({ ...progress });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, Math.max(1, entries.length)) },
    () => worker()
  );
  await Promise.all(workers);

  if (pendingUrls.length > 0) {
    const applied = await applyCandidatoFotos(pendingUrls);
    progress.skippedCadastro += applied.skippedCadastroFoto;
    progress.uploaded = applied.updated;
    if (applied.notFound > 0 && errors.length < 12) {
      errors.push(
        `${applied.notFound} foto(s) enviada(s) sem candidato correspondente no banco.`
      );
    }
  }

  return {
    uploaded: progress.uploaded,
    skippedCadastro: progress.skippedCadastro,
    unmatched: progress.unmatched,
    ambiguous: progress.ambiguous,
    failed: progress.failed,
    errors,
    storageConfigured: true,
  };
}

export function planStorageFotoLinks(
  objectPaths: string[],
  index: UrnaFotoIndex
): Array<{ numero: string; cargo: string; path: string; id?: string }> {
  const planned: Array<{
    numero: string;
    cargo: string;
    path: string;
    id?: string;
  }> = [];
  const seen = new Set<string>();
  for (const path of objectPaths) {
    const match = matchUrnaFotoFilename(path, index);
    if (!match || "ambiguous" in match) continue;
    if (match.target.foto_url?.trim()) continue;
    const key = `${match.target.cargo}::${match.target.numero}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({
      numero: match.target.numero,
      cargo: match.target.cargo,
      path,
      id: match.target.id,
    });
  }
  return planned;
}

async function listStoragePrefix(prefix: string): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id || item.metadata == null;
      if (isFolder) {
        paths.push(...(await listStoragePrefix(full)));
      } else if (isUrnaImagePath(full)) {
        paths.push(full);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return paths;
}

export async function listStorageFotoPaths(): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  return listStoragePrefix("");
}

/**
 * Se o bucket já tem FSP/FBR{SQ}_div e o candidato tem sq_candidato sem
 * foto_url, grava a URL pública. Não inventa imagem.
 */
export async function linkStoredUrnaFotos(): Promise<{
  linked: number;
  checked: number;
  storageConfigured: boolean;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return { linked: 0, checked: 0, storageConfigured: false };
  }
  const [paths, index] = await Promise.all([
    listStorageFotoPaths(),
    indexFromDatabase(),
  ]);
  const planned = planStorageFotoLinks(paths, index);
  if (planned.length === 0) {
    return { linked: 0, checked: paths.length, storageConfigured: true };
  }
  const items: Array<{ numero: string; cargo: string; foto_url: string }> = [];
  for (const row of planned) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.path);
    if (!data?.publicUrl) continue;
    items.push({
      numero: row.numero,
      cargo: row.cargo,
      foto_url: data.publicUrl,
    });
  }
  if (items.length === 0) {
    return { linked: 0, checked: paths.length, storageConfigured: true };
  }
  const applied = await applyCandidatoFotos(items);
  return {
    linked: applied.updated,
    checked: paths.length,
    storageConfigured: true,
  };
}

export async function indexFromDatabase(): Promise<UrnaFotoIndex> {
  const list: Candidato[] = await listCandidatos({
    featuredOnly: false,
    activeRaceOnly: false,
  });
  return buildUrnaFotoIndex(
    list.map((c) => ({
      numero: c.numero,
      cargo: c.cargo,
      sq_candidato: c.sq_candidato ?? null,
      origem: c.origem,
      foto_url: c.foto_url,
      id: c.id,
    }))
  );
}

export function summarizeUrnaFotos(result: UrnaFotoResult): string {
  const bits = [
    `${result.uploaded} foto(s) gravada(s)`,
    result.unmatched ? `${result.unmatched} sem candidato` : "",
    result.ambiguous ? `${result.ambiguous} número ambíguo` : "",
    result.skippedCadastro ? `${result.skippedCadastro} oficial(is) com foto mantida` : "",
    result.failed ? `${result.failed} falha(s)` : "",
  ].filter(Boolean);
  return `Fotos de urna: ${bits.join(" · ")}.`;
}
