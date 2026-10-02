import {
  getSupabase,
  hasSupabaseEnv,
} from "@/lib/supabase";
import JSZip from "jszip";
import { prepareCandidatePhoto } from "@/lib/candidato-foto";
import { applyCandidatoFotos, applyCandidatoSq, listCandidatos } from "@/lib/data";
import type { ChapadaRow } from "@/lib/chapada";
import type { Candidato } from "@/lib/types";
import { normalizeCandidateNumero } from "@/lib/parser/bu-qr";
import { isFeaturedCandidato } from "@/lib/cargos";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const ZIP_EXT = /\.zip$/i;
const CONCURRENCY = 4;
const URL_FLUSH = 8;
const SCAN_CHUNK = 80;
const MAX_ZIP_BYTES = 512 * 1024 * 1024;
export const TSE_ZIP_ENTRY_HINT = 26331;

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
  scanned?: number;
  matched?: number;
  phase?: "reading" | "uploading" | "done";
  status?: string;
}

export interface UrnaFotoResult {
  uploaded: number;
  skippedCadastro: number;
  unmatched: number;
  ambiguous: number;
  failed: number;
  scanned: number;
  matched: number;
  sqInCatalog: number;
  errors: string[];
  storageConfigured: boolean;
}

export function emptyUrnaFotoProgress(): UrnaFotoProgress {
  return {
    done: 0,
    total: TSE_ZIP_ENTRY_HINT,
    uploaded: 0,
    skippedCadastro: 0,
    unmatched: 0,
    ambiguous: 0,
    failed: 0,
    scanned: 0,
    matched: 0,
    phase: "reading",
    status: "Lendo ZIP…",
  };
}

export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(done, 0));
    } else {
      setTimeout(done, 0);
    }
  });
}

export function describeUrnaZipError(err: unknown): string {
  if (err instanceof RangeError) {
    return `Memória esgotada ao ler o ZIP (${err.message}). Feche outras abas e tente de novo.`;
  }
  if (!(err instanceof Error)) {
    return "Falha ao enviar fotos de urna.";
  }
  const m = err.message;
  if (/allocat|out of memory|oom|heap|maximum call/i.test(m)) {
    return `Memória esgotada ao ler o ZIP (${m}). Feche outras abas e tente de novo.`;
  }
  if (/timeout|timed out|aborted/i.test(m)) {
    return `Tempo esgotado (${m}). Tente de novo; o envio é em lotes.`;
  }
  if (/not a zip|isn't a zip|corromp|invalid zip|end of central|can't find end of central/i.test(m)) {
    return `Isso não parece um ZIP válido (${m}). Use foto_cand2026_SP_div.zip.`;
  }
  return m;
}

function countSqInIndex(index: UrnaFotoIndex): number {
  const seen = new Set<string>();
  for (const row of index.bySq.values()) {
    seen.add(`${row.cargo}::${row.numero}`);
  }
  return seen.size;
}

function digitString(value: string): string {
  return value.replace(/\D/g, "");
}

function sqKeys(sq: string): string[] {
  const digits = digitString(sq);
  if (!digits) return [];
  const stripped = digits.replace(/^0+(?=\d)/, "") || digits;
  return stripped === digits ? [digits] : [digits, stripped];
}

/** Same digit string after stripping non-digits (leading zeros kept as alternate keys). */
export function sqDigitStringsEqual(a: string, b: string): boolean {
  const ka = new Set(sqKeys(a));
  for (const k of sqKeys(b)) {
    if (ka.has(k)) return true;
  }
  return false;
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
 * Exact disk names: FSP2500002530091_div.jpg (F + UF + 8–16 digits + _div.jpg).
 * Prefix is F + 2-letter UF (`FSP`, `FBR`, …). Optional folder prefix.
 */
const TSE_EXACT_FILE =
  /(?:^|[/\\])(f[a-z]{2})(\d{8,16})_div\.(jpe?g|png|webp|gif)$/i;
const TSE_FOTO_STEM = /^(?:f[a-z]{2})?(\d{8,16})(?:_div)?$/i;
/** FSP{sq}_div / FBR{sq}_div anywhere in the path (folders, prefixes). */
const TSE_FUF_SQ = /f[a-z]{2}(\d{8,16})(?:_div)?/gi;
const MAX_NR_CANDIDATO_DIGITS = 5;

/**
 * SQ_CANDIDATO digit string from `FSP2500002530091_div.jpg` / `FBR…_div.jpg`.
 * Folder prefixes are ignored. Compare with `sqDigitStringsEqual` to DB.
 */
export function extractSqFromUrnaFilename(path: string): string | null {
  const cleaned = path.replace(/\\/g, "/").trim();
  const exact = cleaned.match(TSE_EXACT_FILE);
  if (exact?.[2]) return exact[2];
  const base = urnaFotoBasename(cleaned);
  const stem = base.match(TSE_FOTO_STEM);
  if (stem?.[1]) return stem[1];
  TSE_FUF_SQ.lastIndex = 0;
  const anywhere = TSE_FUF_SQ.exec(cleaned);
  if (anywhere?.[1]) return anywhere[1];
  const bare = base.match(/^(\d{8,16})$/);
  return bare?.[1] ?? null;
}

export function urnaFotoIdKeys(path: string): string[] {
  const cleaned = path.replace(/\\/g, "/");
  const base = urnaFotoBasename(cleaned);
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    for (const k of sqKeys(raw)) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  };

  const extracted = extractSqFromUrnaFilename(cleaned);
  if (extracted) add(extracted);

  const explicit = base.match(TSE_FOTO_STEM);
  if (explicit?.[1]) add(explicit[1]);

  TSE_FUF_SQ.lastIndex = 0;
  for (const m of cleaned.matchAll(TSE_FUF_SQ)) {
    if (m[1]) add(m[1]);
  }

  const runs = [...base.matchAll(/\d+/g)].map((m) => m[0]);
  runs.sort((a, b) => b.length - a.length);
  for (const run of runs) {
    if (run.length >= 8) add(run);
  }
  for (const run of runs) add(run);

  return keys;
}

export function matchUrnaFotoFilename(
  path: string,
  index: UrnaFotoIndex
): UrnaFotoMatch | { ambiguous: true } | null {
  if (!isUrnaImagePath(path)) return null;
  const extracted = extractSqFromUrnaFilename(path);
  if (extracted) {
    for (const key of sqKeys(extracted)) {
      const hit = index.bySq.get(key);
      if (hit) return { target: hit, via: "sq" };
    }
  }
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

async function loadJsZip(file: File): Promise<JSZip> {
  if (file.size === 0) {
    throw new Error("O arquivo ZIP está vazio.");
  }
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      "ZIP grande demais para processar no navegador (máx. 512 MB). O arquivo do TSE de SP (~26 mil JPGs) deve caber; se não, use Pasta de imagens."
    );
  }
  try {
    return await JSZip.loadAsync(file, { checkCRC32: false });
  } catch (err) {
    throw new Error(describeUrnaZipError(err));
  }
}

function zipEntryNames(zip: JSZip): string[] {
  return Object.keys(zip.files);
}

export function shouldInflateUrnaZipEntry(
  path: string,
  index: UrnaFotoIndex
): boolean {
  const match = matchUrnaFotoFilename(path, index);
  if (!match || "ambiguous" in match) return false;
  return !match.target.foto_url?.trim();
}

/** Lista nomes sem inflar bytes — para testes e prévia. */
export async function inspectUrnaZip(
  file: File,
  index: UrnaFotoIndex
): Promise<{
  scanned: number;
  matched: number;
  unmatched: number;
  skippedExisting: number;
  names: string[];
}> {
  const zip = await loadJsZip(file);
  let scanned = 0;
  let matched = 0;
  let unmatched = 0;
  let skippedExisting = 0;
  const names: string[] = [];
  for (const name of zipEntryNames(zip)) {
    const entry = zip.files[name];
    if (!entry || entry.dir || !isUrnaImagePath(name)) continue;
    scanned += 1;
    names.push(name);
    const hit = matchUrnaFotoFilename(name, index);
    if (!hit || "ambiguous" in hit) {
      unmatched += 1;
      continue;
    }
    if (hit.target.foto_url?.trim()) {
      skippedExisting += 1;
      continue;
    }
    matched += 1;
  }
  return { scanned, matched, unmatched, skippedExisting, names };
}

export async function listImagesFromZip(file: File): Promise<UrnaImageEntry[]> {
  const zip = await loadJsZip(file);
  const entries: UrnaImageEntry[] = [];
  for (const name of zipEntryNames(zip)) {
    const entry = zip.files[name];
    if (!entry || entry.dir || !isUrnaImagePath(name)) continue;
    const bytes = await entry.async("uint8array");
    if (bytes.byteLength === 0) continue;
    entries.push({
      name,
      bytes,
      type: mimeFromName(name),
    });
  }
  return entries;
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
  const originalBase =
    filename.replace(/\\/g, "/").split("/").pop() ||
    `F${(opts.sq?.replace(/\D/g, "") || opts.numero).slice(-16)}_div.${prepared.ext}`;
  const safeBase = originalBase.replace(/[^\w.\-]+/g, "_");
  const path = `urna/${safeBase}`;

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

function hasFotoUrl(target: UrnaFotoTarget): boolean {
  return Boolean(target.foto_url && target.foto_url.trim());
}

function shouldSkipCadastroFoto(target: UrnaFotoTarget): boolean {
  return isFeaturedCandidato(target.origem) && hasFotoUrl(target);
}

function shouldSkipExistingFoto(target: UrnaFotoTarget): boolean {
  return hasFotoUrl(target);
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
      uploaded: progress.uploaded,
      skippedCadastro: progress.skippedCadastro,
      unmatched: progress.unmatched,
      ambiguous: progress.ambiguous,
      failed: progress.failed,
      scanned: progress.done,
      matched: progress.done - progress.unmatched - progress.ambiguous,
      sqInCatalog: countSqInIndex(index),
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
        } else if (shouldSkipExistingFoto(match.target)) {
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
    const sqItems = pendingUrls
      .map((item) => {
        const list = index.byNumero.get(normalizeCandidateNumero(item.numero));
        const target = list?.find((t) => t.cargo === item.cargo);
        const sq = target?.sq_candidato?.replace(/\D/g, "") || "";
        return sq
          ? { numero: item.numero, cargo: item.cargo, sq_candidato: sq }
          : null;
      })
      .filter(
        (x): x is { numero: string; cargo: string; sq_candidato: string } =>
          x != null
      );
    if (sqItems.length > 0) {
      await applyCandidatoSq(sqItems);
    }
  }

  return {
    uploaded: progress.uploaded,
    skippedCadastro: progress.skippedCadastro,
    unmatched: progress.unmatched,
    ambiguous: progress.ambiguous,
    failed: progress.failed,
    scanned: progress.done,
    matched: progress.done - progress.unmatched - progress.ambiguous,
    sqInCatalog: countSqInIndex(index),
    errors,
    storageConfigured: true,
  };
}

/**
 * Enviar ZIP no navegador (JSZip): yield a cada lote para a aba não congelar,
 * infla só quem casa com SQ_CANDIDATO e ainda não tem foto_url, sobe em lotes.
 */
export async function processUrnaZipFile(
  file: File,
  index: UrnaFotoIndex,
  onProgress?: (p: UrnaFotoProgress) => void
): Promise<UrnaFotoResult> {
  const storageConfigured = hasSupabaseEnv();
  const errors: string[] = [];
  const sqInCatalog = countSqInIndex(index);
  const progress: UrnaFotoProgress = {
    ...emptyUrnaFotoProgress(),
    status: "Lendo ZIP…",
    phase: "reading",
  };
  onProgress?.({ ...progress });
  await yieldToUi();

  const zip = await loadJsZip(file);
  const names = zipEntryNames(zip);
  progress.total = Math.max(names.length, 1);
  progress.status = `Lidos 0 de ~${progress.total}`;
  onProgress?.({ ...progress });
  await yieldToUi();

  type PendingUpload = {
    name: string;
    target: UrnaFotoTarget;
    bytes: Uint8Array;
    type: string;
  };
  const pendingUrls: Array<{ numero: string; cargo: string; foto_url: string }> =
    [];
  const uploadQueue: PendingUpload[] = [];

  async function flushUrls() {
    if (pendingUrls.length === 0) return;
    const batch = pendingUrls.splice(0, pendingUrls.length);
    const applied = await applyCandidatoFotos(batch);
    progress.skippedCadastro += applied.skippedCadastroFoto;
    progress.uploaded += applied.updated;
    if (applied.notFound > 0 && errors.length < 12) {
      errors.push(
        `${applied.notFound} foto(s) enviada(s) sem candidato correspondente no banco.`
      );
    }
    const sqItems = batch
      .map((item) => {
        const list = index.byNumero.get(normalizeCandidateNumero(item.numero));
        const target = list?.find((t) => t.cargo === item.cargo);
        const sq = target?.sq_candidato?.replace(/\D/g, "") || "";
        return sq
          ? { numero: item.numero, cargo: item.cargo, sq_candidato: sq }
          : null;
      })
      .filter(
        (x): x is { numero: string; cargo: string; sq_candidato: string } =>
          x != null
      );
    if (sqItems.length > 0) {
      await applyCandidatoSq(sqItems);
    }
  }

  async function flushUploads() {
    if (uploadQueue.length === 0) return;
    const batch = uploadQueue.splice(0, uploadQueue.length);
    progress.phase = "uploading";
    progress.status = `Enviada(s) ${progress.uploaded} · falhas ${progress.failed}`;
    onProgress?.({ ...progress });
    await Promise.all(
      batch.map(async (entry) => {
        if (shouldSkipExistingFoto(entry.target) || shouldSkipCadastroFoto(entry.target)) {
          progress.skippedCadastro += 1;
          return;
        }
        try {
          const url = await uploadBytesToStorage(
            entry.bytes,
            entry.name,
            entry.type,
            {
              numero: entry.target.numero,
              cargo: entry.target.cargo,
              sq: entry.target.sq_candidato,
            }
          );
          pendingUrls.push({
            numero: entry.target.numero,
            cargo: entry.target.cargo,
            foto_url: url,
          });
          entry.target.foto_url = url;
        } catch (err) {
          progress.failed += 1;
          if (errors.length < 12) {
            const msg = describeUrnaZipError(err);
            errors.push(`${entry.name}: ${msg}`);
          }
        }
      })
    );
    if (pendingUrls.length >= URL_FLUSH) await flushUrls();
    progress.status = `Enviada(s) ${progress.uploaded + pendingUrls.length} · falhas ${progress.failed}`;
    onProgress?.({ ...progress });
    await yieldToUi();
  }

  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const entry = zip.files[name];
    if (!entry || entry.dir || !isUrnaImagePath(name)) {
      if ((i + 1) % SCAN_CHUNK === 0) {
        progress.status = `Lidos ${progress.scanned ?? 0} de ~${progress.total}`;
        onProgress?.({ ...progress });
        await yieldToUi();
      }
      continue;
    }
    progress.done += 1;
    progress.scanned = progress.done;
    const match = matchUrnaFotoFilename(name, index);
    if (!match) {
      progress.unmatched += 1;
    } else if ("ambiguous" in match) {
      progress.ambiguous += 1;
    } else if (
      shouldSkipCadastroFoto(match.target) ||
      shouldSkipExistingFoto(match.target)
    ) {
      progress.skippedCadastro += 1;
      progress.matched = (progress.matched ?? 0) + 1;
    } else {
      progress.matched = (progress.matched ?? 0) + 1;
      if (storageConfigured) {
        try {
          const bytes = await entry.async("uint8array");
          if (bytes.byteLength > 0) {
            uploadQueue.push({
              name,
              target: match.target,
              bytes,
              type: mimeFromName(name),
            });
          }
        } catch (err) {
          progress.failed += 1;
          if (errors.length < 12) {
            errors.push(`${name}: ${describeUrnaZipError(err)}`);
          }
        }
      }
    }

    if ((progress.scanned ?? 0) % SCAN_CHUNK === 0) {
      progress.phase = "reading";
      progress.status = `Lidos ${progress.scanned} de ~${progress.total}`;
      onProgress?.({ ...progress });
      await yieldToUi();
    }
    if (uploadQueue.length >= CONCURRENCY) {
      await flushUploads();
    }
  }

  await flushUploads();
  await flushUrls();

  if (!storageConfigured) {
    return {
      uploaded: 0,
      skippedCadastro: progress.skippedCadastro,
      unmatched: progress.unmatched,
      ambiguous: progress.ambiguous,
      failed: progress.failed,
      scanned: progress.scanned ?? progress.done,
      matched: progress.matched ?? 0,
      sqInCatalog,
      errors: [
        "Storage não configurado. Defina as variáveis do Supabase e rode a migration 003 (bucket candidatos). A URL da foto só é gravada depois que o upload funciona.",
      ],
      storageConfigured: false,
    };
  }

  progress.phase = "done";
  progress.status = `Enviada(s) ${progress.uploaded} · falhas ${progress.failed}`;
  onProgress?.({ ...progress });

  return {
    uploaded: progress.uploaded,
    skippedCadastro: progress.skippedCadastro,
    unmatched: progress.unmatched,
    ambiguous: progress.ambiguous,
    failed: progress.failed,
    scanned: progress.scanned ?? progress.done,
    matched: progress.matched ?? 0,
    sqInCatalog,
    errors,
    storageConfigured: true,
  };
}

export function planStorageFotoLinks(
  objectPaths: string[],
  index: UrnaFotoIndex
): Array<{
  numero: string;
  cargo: string;
  path: string;
  id?: string;
  sq_candidato?: string | null;
}> {
  const planned: Array<{
    numero: string;
    cargo: string;
    path: string;
    id?: string;
    sq_candidato?: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const path of objectPaths) {
    const match = matchUrnaFotoFilename(path, index);
    if (!match || "ambiguous" in match) continue;
    if (shouldSkipExistingFoto(match.target)) continue;
    const key = `${match.target.cargo}::${match.target.numero}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({
      numero: match.target.numero,
      cargo: match.target.cargo,
      path,
      id: match.target.id,
      sq_candidato: match.target.sq_candidato ?? null,
    });
  }
  return planned;
}

const STORAGE_PAGE = 1000;
const EXTRA_STORAGE_PREFIXES = [
  "urna",
  "fotos",
  "foto_cand2026_SP_div",
  "foto_cand2026_BR_div",
  "foto_cand2026_SP",
  "foto_cand2026_BR",
  "candidatos",
];

export interface StorageBucketScan {
  listed: number;
  imagePaths: string[];
  zipPaths: string[];
  otherPaths: string[];
}

export function isUrnaZipPath(path: string): boolean {
  const cleaned = path.replace(/\\/g, "/");
  if (cleaned.includes("__MACOSX")) return false;
  const file = cleaned.split("/").pop() ?? "";
  if (file.startsWith(".")) return false;
  return ZIP_EXT.test(cleaned);
}

export function storageZipOnlyHint(scan: StorageBucketScan): string | null {
  if (scan.zipPaths.length === 0) return null;
  if (scan.imagePaths.length > 20) return null;
  const zipLabel = scan.zipPaths.slice(0, 3).join(", ");
  return `ZIP no bucket não vale — precisa dos JPGs. Objeto ${zipLabel} não casa com SQ_CANDIDATO. Em Cadastro, use Enviar ZIP: o navegador extrai e sobe cada JPG em lotes. Não descompacte 26 mil arquivos no servidor.`;
}

function isStorageFolder(
  item: { id?: string | null; metadata?: unknown; name?: string },
  name: string
): boolean {
  if (IMAGE_EXT.test(name) || ZIP_EXT.test(name)) return false;
  return !item.id || item.metadata == null;
}

async function listStoragePrefixScan(
  prefix: string,
  seen: Set<string>,
  scan: StorageBucketScan
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  let offset = 0;
  let prevFirst = "";
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: STORAGE_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      if (offset === 0 && prefix) return;
      throw new Error(
        `Falha ao listar Storage (${prefix || "/"}): ${error.message}`
      );
    }
    if (!data || data.length === 0) break;
    const first = data[0]?.name ?? "";
    if (offset > 0 && first === prevFirst) break;
    prevFirst = first;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (seen.has(full)) continue;
      seen.add(full);
      if (isStorageFolder(item, item.name)) {
        await listStoragePrefixScan(full, seen, scan);
        continue;
      }
      scan.listed += 1;
      if (isUrnaImagePath(full)) {
        scan.imagePaths.push(full);
      } else if (isUrnaZipPath(full)) {
        scan.zipPaths.push(full);
      } else {
        scan.otherPaths.push(full);
      }
    }
    if (data.length < STORAGE_PAGE) break;
    offset += STORAGE_PAGE;
  }
}

export async function listStorageBucket(): Promise<StorageBucketScan> {
  const empty: StorageBucketScan = {
    listed: 0,
    imagePaths: [],
    zipPaths: [],
    otherPaths: [],
  };
  const supabase = getSupabase();
  if (!supabase) return empty;
  const seen = new Set<string>();
  await listStoragePrefixScan("", seen, empty);
  for (const extra of EXTRA_STORAGE_PREFIXES) {
    if (seen.has(extra)) continue;
    await listStoragePrefixScan(extra, seen, empty);
  }
  return empty;
}

export async function listStorageFotoPaths(): Promise<string[]> {
  const scan = await listStorageBucket();
  return scan.imagePaths;
}

/**
 * Se o bucket já tem FSP/FBR{SQ}_div e o candidato tem sq_candidato sem
 * foto_url, grava a URL pública. Não inventa imagem.
 */
export interface LinkStoredUrnaResult {
  linked: number;
  listed: number;
  unmatched: number;
  skippedCadastro: number;
  sqFilled: number;
  checked: number;
  imageCount: number;
  zipCount: number;
  zipPaths: string[];
  zipOnlyHint: string | null;
  storageConfigured: boolean;
}

export async function linkStoredUrnaFotos(opts?: {
  extraIndex?: UrnaFotoIndex;
}): Promise<LinkStoredUrnaResult> {
  const empty: LinkStoredUrnaResult = {
    linked: 0,
    listed: 0,
    unmatched: 0,
    skippedCadastro: 0,
    sqFilled: 0,
    checked: 0,
    imageCount: 0,
    zipCount: 0,
    zipPaths: [],
    zipOnlyHint: null,
    storageConfigured: false,
  };
  const supabase = getSupabase();
  if (!supabase) return empty;
  const [scan, dbIndex] = await Promise.all([
    listStorageBucket(),
    indexFromDatabase(),
  ]);
  const paths = scan.imagePaths;
  const zipOnlyHint = storageZipOnlyHint(scan);
  const index = opts?.extraIndex
    ? mergeUrnaFotoIndexes(opts.extraIndex, dbIndex)
    : dbIndex;
  let unmatched = 0;
  let skippedCadastro = 0;
  const planned: ReturnType<typeof planStorageFotoLinks> = [];
  const seenKey = new Set<string>();
  for (const path of paths) {
    const match = matchUrnaFotoFilename(path, index);
    if (!match) {
      unmatched += 1;
      continue;
    }
    if ("ambiguous" in match) {
      unmatched += 1;
      continue;
    }
    if (shouldSkipExistingFoto(match.target)) {
      skippedCadastro += 1;
      continue;
    }
    const key = `${match.target.cargo}::${match.target.numero}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    planned.push({
      numero: match.target.numero,
      cargo: match.target.cargo,
      path,
      id: match.target.id,
      sq_candidato: match.target.sq_candidato ?? null,
    });
  }
  const sqItems = planned
    .map((row) => {
      const sq = (row.sq_candidato ?? "").replace(/\D/g, "");
      return sq
        ? { numero: row.numero, cargo: row.cargo, sq_candidato: sq }
        : null;
    })
    .filter(
      (x): x is { numero: string; cargo: string; sq_candidato: string } =>
        x != null
    );
  const sqFilled =
    sqItems.length > 0 ? (await applyCandidatoSq(sqItems)).updated : 0;

  const items: Array<{
    numero: string;
    cargo: string;
    foto_url: string;
    id?: string;
  }> = [];
  for (const row of planned) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.path);
    if (!data?.publicUrl) continue;
    items.push({
      numero: row.numero,
      cargo: row.cargo,
      foto_url: data.publicUrl,
      id: row.id,
    });
  }
  const applied =
    items.length > 0
      ? await applyCandidatoFotos(items)
      : { updated: 0, skippedCadastroFoto: 0, notFound: 0 };
  return {
    linked: applied.updated,
    listed: scan.listed,
    unmatched,
    skippedCadastro: skippedCadastro + applied.skippedCadastroFoto,
    sqFilled,
    checked: scan.listed,
    imageCount: scan.imagePaths.length,
    zipCount: scan.zipPaths.length,
    zipPaths: scan.zipPaths,
    zipOnlyHint,
    storageConfigured: true,
  };
}

export function summarizeVincular(result: LinkStoredUrnaResult): string {
  const head = `Vistos ${result.listed} · vinculadas ${result.linked}`;
  const extras: string[] = [];
  if (result.zipOnlyHint) extras.push(result.zipOnlyHint);
  else if (result.skippedCadastro) {
    extras.push(`${result.skippedCadastro} oficial(is) com foto mantida`);
  }
  if (!result.zipOnlyHint && result.unmatched) {
    extras.push(`${result.unmatched} arquivo(s) sem SQ no catálogo`);
  }
  if (result.listed === 0) {
    extras.push("bucket vazio ou listagem sem permissão");
  } else if (result.linked === 0 && !result.zipOnlyHint) {
    extras.push(
      "SQ já está no banco — confira se o arquivo é FSP{sq}_div.jpg / FBR{sq}_div.jpg"
    );
  }
  return extras.length > 0 ? `${head}. ${extras.join(" ")}` : `${head}.`;
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
  if (result.scanned > 0 && result.matched === 0) {
    return `Vistos ${result.scanned} arquivo(s) no ZIP · 0 casaram com SQ_CANDIDATO (catálogo tem ${result.sqInCatalog} com SQ). Importe o CSV do TSE e tente de novo.`;
  }
  const bits = [
    `${result.uploaded} foto(s) gravada(s)`,
    result.scanned ? `${result.scanned} lido(s)` : "",
    result.matched ? `${result.matched} com SQ` : "",
    result.unmatched ? `${result.unmatched} sem candidato` : "",
    result.ambiguous ? `${result.ambiguous} número ambíguo` : "",
    result.skippedCadastro ? `${result.skippedCadastro} com foto mantida` : "",
    result.failed ? `${result.failed} falha(s)` : "",
  ].filter(Boolean);
  return `Fotos de urna: ${bits.join(" · ")}.`;
}

export function formatUrnaFotoProgress(p: UrnaFotoProgress): string {
  if (p.phase === "uploading" || (p.uploaded > 0 || p.failed > 0)) {
    const lidos =
      p.scanned != null
        ? `Lidos ${p.scanned} de ~${p.total || TSE_ZIP_ENTRY_HINT}`
        : p.status || "Lendo ZIP…";
    return `${lidos} · Enviada(s) ${p.uploaded} · falhas ${p.failed}`;
  }
  if ((p.scanned ?? 0) > 0) {
    return `Lidos ${p.scanned} de ~${p.total || TSE_ZIP_ENTRY_HINT}`;
  }
  return p.status || "Lendo ZIP…";
}
