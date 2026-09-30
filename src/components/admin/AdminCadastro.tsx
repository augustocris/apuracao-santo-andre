"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  Check,
  FileUp,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Trophy,
  Users,
  MapPinned,
  MonitorPlay,
  X,
} from "lucide-react";
import { RankingGeral } from "@/components/admin/RankingGeral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CARGO_DIGITOS,
  CARGO_SLOTS,
  CARGOS_OFICIAIS,
  CONFIG_STORAGE_KEY,
  DEFAULT_CHEFE_PIN,
  labelCargoCurto,
  type CargoOficial,
} from "@/lib/cargos";
import {
  CHAPADA_HINT,
  decodeChapadaBytes,
  parseChapadaPayload,
  summarizeChapadaParse,
  type ChapadaRow,
} from "@/lib/chapada";
import {
  isProbablyImageUrl,
  uploadCandidatoFoto,
} from "@/lib/candidato-foto";
import {
  indexFromChapadaRows,
  indexFromDatabase,
  listImagesFromFiles,
  listImagesFromZip,
  mergeUrnaFotoIndexes,
  processUrnaFotos,
  summarizeUrnaFotos,
  type UrnaFotoProgress,
} from "@/lib/urna-fotos";
import {
  applyZonasExpectativa,
  dataModeLabel,
  getConfig,
  importCandidatos,
  listCandidatos,
  removeCandidato,
  saveChefePin,
  saveRelatorioCargos,
  saveSecoesEsperadas,
  upsertCandidato,
} from "@/lib/data";
import type { ApuracaoConfig, Candidato, ZonaConfigRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type CadastroTab = "candidatos" | "secoes" | "relatorio" | "ranking";

interface AdminCadastroProps {
  onConfigSaved?: () => void;
}

const EMPTY_ZONA: ZonaConfigRow = { zona: "", secoes: 1 };

export function AdminCadastro({ onConfigSaved }: AdminCadastroProps) {
  const mode = dataModeLabel();
  const [tab, setTab] = useState<CadastroTab>("candidatos");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [config, setConfig] = useState<ApuracaoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Candidate form
  const [editId, setEditId] = useState<string | null>(null);
  const [formCargo, setFormCargo] = useState<CargoOficial>("Governador");
  const [formNumero, setFormNumero] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formFotoUrl, setFormFotoUrl] = useState("");
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Sections form
  const [totalEsperado, setTotalEsperado] = useState("10");
  const [zonaRows, setZonaRows] = useState<ZonaConfigRow[]>([
    { zona: "001", secoes: 5 },
    { zona: "002", secoes: 5 },
  ]);

  // Report selector
  const [relatorioTodos, setRelatorioTodos] = useState(true);
  const [relatorioCargos, setRelatorioCargos] = useState<string[]>([
    ...CARGOS_OFICIAIS,
  ]);
  const [chefePin, setChefePin] = useState(DEFAULT_CHEFE_PIN);
  const [chapadaText, setChapadaText] = useState("");
  const [chapadaBusy, setChapadaBusy] = useState(false);
  const [lastChapadaRows, setLastChapadaRows] = useState<ChapadaRow[]>([]);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [fotoProgress, setFotoProgress] = useState<UrnaFotoProgress | null>(
    null
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cands, cfg] = await Promise.all([
        listCandidatos({ activeRaceOnly: true }),
        getConfig(),
      ]);
      setCandidatos(cands);
      setConfig(cfg);
      setChefePin(cfg.chefe_pin?.trim() || DEFAULT_CHEFE_PIN);
      setTotalEsperado(String(cfg.secoes_esperadas || 10));
      if (cfg.zonas_config.length > 0) {
        setZonaRows(cfg.zonas_config);
      }
      const isTodos =
        cfg.relatorio_cargos.includes("todos") ||
        cfg.relatorio_cargos.length === 0 ||
        CARGOS_OFICIAIS.every((c) => cfg.relatorio_cargos.includes(c));
      setRelatorioTodos(isTodos);
      setRelatorioCargos(
        isTodos
          ? [...CARGOS_OFICIAIS]
          : cfg.relatorio_cargos.filter((c) =>
              (CARGOS_OFICIAIS as readonly string[]).includes(c)
            )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar cadastro.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    try {
      const raw = sessionStorage.getItem("apuracao-sa-tse-chapada");
      if (raw) {
        const parsed = JSON.parse(raw) as ChapadaRow[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLastChapadaRows(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, [reload]);

  const slotsHint = useMemo(() => {
    return CARGOS_OFICIAIS.map((cargo) => {
      const count = candidatos.filter((c) => c.cargo === cargo).length;
      const expected = CARGO_SLOTS[cargo];
      return { cargo, count, expected };
    });
  }, [candidatos]);

  function resetCandForm() {
    setEditId(null);
    setFormCargo("Governador");
    setFormNumero("");
    setFormNome("");
    setFormFotoUrl("");
  }

  function startEdit(c: Candidato) {
    setEditId(c.id);
    setFormCargo(c.cargo as CargoOficial);
    setFormNumero(c.numero);
    setFormNome(c.nome);
    setFormFotoUrl(c.foto_url ?? "");
    setTab("candidatos");
  }

  async function handleFotoFile(file: File | null) {
    if (!file) return;
    setUploadingFoto(true);
    setError(null);
    setMessage(null);
    try {
      const url = await uploadCandidatoFoto(file, {
        candidatoId: editId ?? undefined,
        numero: formNumero || undefined,
      });
      setFormFotoUrl(url);
      setMessage("Foto pronta — salve o candidato para gravar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload da foto.");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function handleSaveCandidato(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const foto = formFotoUrl.trim();
      if (foto && !isProbablyImageUrl(foto)) {
        throw new Error("URL da foto inválida. Use http(s) ou faça upload.");
      }
      await upsertCandidato({
        id: editId ?? undefined,
        numero: formNumero,
        nome: formNome,
        cargo: formCargo,
        foto_url: foto || null,
      });
      setMessage(editId ? "Candidato atualizado." : "Candidato cadastrado.");
      resetCandForm();
      await reload();
      onConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar candidato.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCandidato(id: string) {
    if (!window.confirm("Remover este candidato?")) return;
    setBusy(true);
    setError(null);
    try {
      await removeCandidato(id);
      setMessage("Candidato removido.");
      if (editId === id) resetCandForm();
      await reload();
      onConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setBusy(false);
    }
  }

  async function runChapadaImport(text: string) {
    const parsed = parseChapadaPayload(text);
    if (parsed.rows.length === 0) {
      const extra = summarizeChapadaParse(parsed);
      throw new Error(
        parsed.errors[0] ??
          `Nenhum candidato válido. Importe o CSV do TSE (SP) ou numero,nome,cargo. ${extra}`
      );
    }
    const result = await importCandidatos(parsed.rows, { origem: "catalogo" });
    setLastChapadaRows(parsed.rows);
    try {
      sessionStorage.setItem(
        "apuracao-sa-tse-chapada",
        JSON.stringify(parsed.rows)
      );
    } catch {
      /* ignore quota */
    }
    const skipOficiais =
      result.skippedCadastro > 0
        ? ` ${result.skippedCadastro} oficial(is) do telão preservado(s).`
        : "";
    setMessage(
      `Chapada: ${summarizeChapadaParse(parsed)}. ${result.upserted} gravado(s) no catálogo.${skipOficiais}`
    );
    setChapadaText("");
    await reload();
    onConfigSaved?.();
  }

  async function readChapadaFile(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return decodeChapadaBytes(bytes);
  }

  async function handleChapadaPaste(e: FormEvent) {
    e.preventDefault();
    setChapadaBusy(true);
    setError(null);
    setMessage(null);
    try {
      await runChapadaImport(chapadaText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar chapada.");
    } finally {
      setChapadaBusy(false);
    }
  }

  async function handleChapadaFile(file: File | null) {
    if (!file) return;
    setChapadaBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await readChapadaFile(file);
      await runChapadaImport(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar chapada.");
    } finally {
      setChapadaBusy(false);
    }
  }

  async function handleUrnaFotos(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setFotoBusy(true);
    setError(null);
    setMessage(null);
    setFotoProgress({
      done: 0,
      total: 0,
      uploaded: 0,
      skippedCadastro: 0,
      unmatched: 0,
      ambiguous: 0,
      failed: 0,
    });
    try {
      const zipFiles = list.filter((f) =>
        /\.zip$/i.test(f.name) || f.type === "application/zip"
      );
      const imageFiles = list.filter((f) =>
        /\.(jpe?g|png|webp|gif)$/i.test(f.name)
      );
      const entries = [
        ...(await Promise.all(zipFiles.map((z) => listImagesFromZip(z)))).flat(),
        ...(await listImagesFromFiles(imageFiles)),
      ];
      if (entries.length === 0) {
        throw new Error(
          "Nenhuma foto JPG/PNG encontrada no ZIP ou na pasta. Nomeie os arquivos com SQ_CANDIDATO (ex.: 250000123456.jpg) ou o número de urna."
        );
      }
      const fromCsv = indexFromChapadaRows(lastChapadaRows);
      const fromDb = await indexFromDatabase();
      const index = mergeUrnaFotoIndexes(fromCsv, fromDb);
      const result = await processUrnaFotos(entries, index, setFotoProgress);
      setMessage(summarizeUrnaFotos(result));
      if (result.errors.length > 0) {
        setError(result.errors.join(" "));
      }
      await reload();
      onConfigSaved?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao enviar fotos de urna."
      );
    } finally {
      setFotoBusy(false);
    }
  }

  async function handleSaveSecoes(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const total = Number.parseInt(totalEsperado, 10);
      const hasZonas = zonaRows.some(
        (r) => r.zona.replace(/\D/g, "") && r.secoes > 0
      );

      if (hasZonas) {
        const result = await applyZonasExpectativa(zonaRows, {
          replaceExisting: true,
          totalOverride: Number.isFinite(total) && total > 0 ? total : undefined,
        });
        setMessage(
          `Expectativa salva: ${result.secoesEsperadas} seções · ${result.locais} locais gerados.`
        );
      } else if (Number.isFinite(total) && total > 0) {
        await saveSecoesEsperadas(total);
        setMessage(`Total esperado atualizado: ${total} seções.`);
      } else {
        throw new Error("Informe o total de seções ou zonas com quantidades.");
      }
      await reload();
      onConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar seções.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRelatorio(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const cargos = relatorioTodos ? ["todos"] : relatorioCargos;
      const saved = await saveRelatorioCargos(cargos);
      try {
        localStorage.setItem(
          CONFIG_STORAGE_KEY,
          JSON.stringify(saved.relatorio_cargos)
        );
      } catch {
        /* ignore */
      }
      setMessage(
        relatorioTodos
          ? "Telão exibirá todos os cargos."
          : `Telão filtrado: ${saved.relatorio_cargos.map(labelCargoCurto).join(", ")}.`
      );
      await reload();
      onConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar relatório.");
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: CadastroTab; label: string; icon: typeof Users }> = [
    { id: "ranking", label: "Ranking geral", icon: Trophy },
    { id: "candidatos", label: "Candidatos", icon: Users },
    { id: "secoes", label: "Zonas / Seções", icon: MapPinned },
    { id: "relatorio", label: "Relatório telão", icon: MonitorPlay },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Cadastro da apuração</h2>
          <p className="text-sm text-slate-400">
            Telão: 5 oficiais. Ranking: CSV do TSE (SP) ou numero,nome,cargo.
            {config
              ? ` · ${config.secoes_esperadas} seções esperadas`
              : ""}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
            mode === "supabase"
              ? "border border-emerald-400/40 bg-emerald-950/50 text-emerald-200"
              : "border border-amber-400/50 bg-amber-950/60 text-amber-100"
          )}
          title={
            mode === "supabase"
              ? "Lendo e gravando na tabela candidatos do Supabase"
              : "Sem env Supabase — dados só nesta sessão do navegador"
          }
        >
          Fonte: {mode === "supabase" ? "Supabase" : "MOCK"}
        </span>
      </div>

      {mode === "mock" && (
        <div
          role="status"
          className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-50"
        >
          <p className="font-semibold">Modo MOCK ativo — nada é gravado no Supabase.</p>
          <p className="mt-1 text-amber-100/90">
            Na Vercel → Project → Settings → Environment Variables, defina{" "}
            <code className="text-amber-200">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code className="text-amber-200">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            (Production), depois <strong>Redeploy</strong> e hard refresh (Ctrl+Shift+R).
            Cadastros feitos agora somem ao recarregar e não aparecem no Table Editor.
          </p>
        </div>
      )}

      <div
        role="tablist"
        className="flex flex-wrap gap-1 rounded-xl bg-slate-900/80 p-1"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              variant="ghost"
              className={cn(
                "h-10 flex-1 min-w-[8rem] rounded-lg text-sm font-semibold",
                tab === t.id
                  ? "bg-[#00ADEF] text-[#001a3a] hover:bg-[#00ADEF]"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setTab(t.id)}
            >
              <Icon className="size-4" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {tab === "ranking" && (
        <div className="space-y-5">
          <RankingGeral />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setBusy(true);
                setError(null);
                setMessage(null);
                try {
                  await saveChefePin(chefePin);
                  setMessage("PIN do chefe atualizado.");
                  onConfigSaved?.();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Falha ao salvar o PIN."
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-4"
          >
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              PIN do acesso chefe
            </h3>
            <p className="text-xs text-slate-400">
              Página{" "}
              <a href="/chefe" className="text-[#00ADEF] underline">
                /chefe
              </a>
              . Padrão <code className="text-[#FFDE00]">andre2026</code>. Cole a
              migration 005 no Supabase para persistir no banco.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="text"
                value={chefePin}
                onChange={(e) => setChefePin(e.target.value)}
                className="max-w-xs border-white/15 bg-slate-950 text-white"
                autoComplete="off"
                disabled={busy}
              />
              <Button
                type="submit"
                disabled={busy}
                className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
              >
                Salvar PIN
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading && tab !== "ranking" && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100"
        >
          <Check className="size-4 shrink-0" />
          {message}
        </p>
      )}

      {!loading && tab === "candidatos" && (
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleChapadaPaste(e)}
            className="space-y-3 rounded-xl border border-[#00ADEF]/30 bg-slate-900/50 p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
              <FileUp className="size-4 text-[#00ADEF]" />
              Importar chapada
            </h3>
            <p className="text-sm text-slate-300">{CHAPADA_HINT}</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">
              <li>
                <strong className="text-slate-300">CSV do TSE (SP)</strong> —
                consulta_cand com ponto-e-vírgula ou vírgula, aspas, latin1 ou
                UTF-8. Usa{" "}
                <code className="text-[#FFDE00]">NR_CANDIDATO</code>,{" "}
                <code className="text-[#FFDE00]">NM_URNA_CANDIDATO</code> (ou{" "}
                <code className="text-[#FFDE00]">NM_CANDIDATO</code>) e{" "}
                <code className="text-[#FFDE00]">DS_CARGO</code>. Filtra{" "}
                <code className="text-[#FFDE00]">SG_UF</code> SP; Presidente
                entra mesmo com UF BR. Vice, suplente, prefeito e vereador são
                ignorados.
              </li>
              <li>
                <strong className="text-slate-300">Simplificado</strong> —{" "}
                <code className="text-[#FFDE00]">numero,nome,cargo</code>{" "}
                (Deputado Estadual, Deputado Federal, Senador, Governador,
                Presidente). Ex.:{" "}
                <code className="text-slate-400">
                  supabase/seed-chapada-exemplo.csv
                </code>
              </li>
            </ul>
            <p className="text-xs text-slate-500">
              Não altera os nomes dos 5 oficiais do telão (origem cadastro).
              Depois do CSV, envie o ZIP de fotos de urna.
            </p>
            <textarea
              value={chapadaText}
              onChange={(e) => setChapadaText(e.target.value)}
              rows={5}
              placeholder={"numero,nome,cargo\n1001,Keila Giselle,Deputado Federal"}
              className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-100"
              disabled={chapadaBusy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={chapadaBusy || !chapadaText.trim()}
                className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
              >
                {chapadaBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileUp className="size-4" />
                )}
                Importar texto
              </Button>
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-white/20 px-3 text-sm font-medium text-white hover:bg-white/5">
                Arquivo CSV/JSON
                <input
                  type="file"
                  accept=".csv,.json,.txt,text/csv,application/json,text/plain"
                  className="hidden"
                  disabled={chapadaBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void handleChapadaFile(file);
                  }}
                />
              </label>
            </div>
            {lastChapadaRows.length > 0 && (
              <p className="text-xs text-[#00ADEF]">
                Última chapada nesta sessão: {lastChapadaRows.length} candidato(s)
                para casar fotos pelo SQ_CANDIDATO.
              </p>
            )}
          </form>

          <div className="space-y-3 rounded-xl border border-[#FFDE00]/25 bg-slate-900/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
              <Archive className="size-4 text-[#FFDE00]" />
              Enviar ZIP de fotos de urna
            </h3>
            <p className="text-sm text-slate-300">
              Pacote TSE com arquivos{" "}
              <code className="text-[#FFDE00]">SQ_CANDIDATO.jpg</code> (também{" "}
              .jpeg/.png) ou pelo número{" "}
              <code className="text-[#FFDE00]">NR_CANDIDATO.jpg</code>. O ZIP é
              aberto no navegador e as fotos sobem em lotes para o bucket{" "}
              <code className="text-[#00ADEF]">candidatos</code> — não envie o
              ZIP inteiro para a API.
            </p>
            <p className="text-xs text-slate-500">
              Oficiais do telão: a foto de cadastro só é preenchida se estiver
              vazia. Sem Storage configurado a URL não é gravada.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#00ADEF] px-3 text-sm font-semibold text-[#001a3a] hover:bg-[#33c0f3]">
                {fotoBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Archive className="size-4" />
                )}
                Enviar ZIP de fotos de urna
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  disabled={fotoBusy || chapadaBusy}
                  onChange={(e) => {
                    const files = e.target.files;
                    e.target.value = "";
                    void handleUrnaFotos(files);
                  }}
                />
              </label>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-medium text-white hover:bg-white/5">
                <Images className="size-4" />
                Pasta de imagens
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  disabled={fotoBusy || chapadaBusy}
                  {...{ webkitdirectory: "", directory: "" }}
                  onChange={(e) => {
                    const files = e.target.files;
                    e.target.value = "";
                    void handleUrnaFotos(files);
                  }}
                />
              </label>
            </div>
            {fotoBusy && fotoProgress && (
              <p className="text-xs text-slate-400">
                Processando {fotoProgress.done}/{fotoProgress.total} ·{" "}
                {fotoProgress.uploaded} enviada(s)
                {fotoProgress.failed ? ` · ${fotoProgress.failed} falha(s)` : ""}
              </p>
            )}
          </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <form
            onSubmit={(e) => void handleSaveCandidato(e)}
            className="space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-4"
          >
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              {editId ? "Editar candidato" : "Novo candidato"}
            </h3>
            <div className="space-y-2">
              <Label htmlFor="cand-cargo" className="text-slate-300">
                Cargo
              </Label>
              <select
                id="cand-cargo"
                value={formCargo}
                onChange={(e) => {
                  setFormCargo(e.target.value as CargoOficial);
                  setFormNumero("");
                }}
                className="flex h-10 w-full rounded-lg border border-white/15 bg-slate-950 px-3 text-sm text-white"
                disabled={busy}
              >
                {CARGOS_OFICIAIS.map((c) => (
                  <option key={c} value={c}>
                    {c} ({CARGO_DIGITOS[c]} dígitos · até {CARGO_SLOTS[c]})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-numero" className="text-slate-300">
                Número ({CARGO_DIGITOS[formCargo]} dígitos)
              </Label>
              <Input
                id="cand-numero"
                inputMode="numeric"
                pattern={`\\d{${CARGO_DIGITOS[formCargo]}}`}
                maxLength={CARGO_DIGITOS[formCargo]}
                value={formNumero}
                onChange={(e) =>
                  setFormNumero(e.target.value.replace(/\D/g, ""))
                }
                placeholder={"0".repeat(CARGO_DIGITOS[formCargo])}
                className="border-white/15 bg-slate-950 text-white"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-nome" className="text-slate-300">
                Nome
              </Label>
              <Input
                id="cand-nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Nome do candidato"
                className="border-white/15 bg-slate-950 text-white"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Foto</Label>
              <div className="flex items-start gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-[#001a3a]">
                  {formFotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={formFotoUrl}
                      alt="Prévia da foto"
                      className="size-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-white/35">
                      <ImagePlus className="size-7" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    id="cand-foto-url"
                    type="url"
                    value={formFotoUrl.startsWith("data:") ? "" : formFotoUrl}
                    onChange={(e) => setFormFotoUrl(e.target.value)}
                    placeholder="URL pública da foto (https://…)"
                    className="border-white/15 bg-slate-950 text-white"
                    disabled={busy || uploadingFoto}
                  />
                  {formFotoUrl.startsWith("data:") && (
                    <p className="text-xs text-[#00ADEF]">
                      Foto carregada localmente (data URL) — salve o candidato.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={busy || uploadingFoto}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void handleFotoFile(f);
                        }}
                      />
                      <span
                        className={cn(
                          "inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10",
                          (busy || uploadingFoto) && "pointer-events-none opacity-50"
                        )}
                      >
                        {uploadingFoto ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ImagePlus className="size-4" />
                        )}
                        Enviar arquivo
                      </span>
                    </label>
                    {formFotoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-300 hover:text-red-200"
                        disabled={busy || uploadingFoto}
                        onClick={() => setFormFotoUrl("")}
                      >
                        <X className="size-4" />
                        Remover foto
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Preferência: upload para o bucket Supabase{" "}
                    <code className="text-[#00ADEF]">candidatos</code> (SQL
                    migration 003). Alternativa: colar URL pública.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || uploadingFoto}
                className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {editId ? "Salvar alteração" : "Cadastrar"}
              </Button>
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 text-white"
                  onClick={resetCandForm}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              )}
            </div>
            <ul className="space-y-1 pt-2 text-xs text-slate-400">
              {slotsHint.map((s) => (
                <li key={s.cargo}>
                  {labelCargoCurto(s.cargo)}: {s.count}/{s.expected} cadastrado
                  {s.count !== 1 ? "s" : ""}
                </li>
              ))}
            </ul>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              Cadastrados
            </h3>
            {candidatos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/20 p-6 text-center text-sm text-slate-400">
                {mode === "supabase"
                  ? "Nenhum candidato no Supabase. A tabela está vazia — cadastre Governador, Senadores, Dep. Federal e Dep. Estadual."
                  : "Nenhum candidato no modo MOCK. Cadastre aqui para demo local (não sincroniza com o banco) ou configure as variáveis Supabase na Vercel."}
              </p>
            ) : (
              <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
                {candidatos.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 bg-slate-900/40 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#001a3a]">
                        {c.foto_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.foto_url}
                            alt=""
                            className="size-full object-cover object-top"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs font-bold text-white/70">
                            {c.numero}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {c.nome}
                        </p>
                        <p className="text-xs text-slate-400">
                          {labelCargoCurto(c.cargo)} · Nº {c.numero}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-slate-300 hover:text-white"
                        onClick={() => startEdit(c)}
                        disabled={busy}
                        aria-label={`Editar ${c.nome}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-red-300 hover:text-red-200"
                        onClick={() => void handleDeleteCandidato(c.id)}
                        disabled={busy}
                        aria-label={`Remover ${c.nome}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </div>
      )}

      {!loading && tab === "secoes" && (
        <form
          onSubmit={(e) => void handleSaveSecoes(e)}
          className="space-y-4"
        >
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-4">
            <Label htmlFor="total-secoes" className="text-slate-300">
              Total de seções esperadas
            </Label>
            <Input
              id="total-secoes"
              inputMode="numeric"
              value={totalEsperado}
              onChange={(e) =>
                setTotalEsperado(e.target.value.replace(/\D/g, ""))
              }
              className="max-w-xs border-white/15 bg-slate-950 text-white"
              disabled={busy}
            />
            <p className="text-xs text-slate-400">
              Progresso do telão = urnas recebidas / este total (enviadas /
              faltam). Se preencher as zonas abaixo, o total pode ser a soma
              delas.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
                Zonas (opcional)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/20 text-white"
                onClick={() =>
                  setZonaRows((rows) => [...rows, { ...EMPTY_ZONA }])
                }
                disabled={busy}
              >
                <Plus className="size-4" />
                Zona
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              “Zona X tem N seções” gera linhas em{" "}
              <code className="text-[#00ADEF]">locais_votacao</code> (nome
              placeholder) para o fiscal encontrar a escola.
            </p>
            <div className="space-y-2">
              {zonaRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Zona</Label>
                    <Input
                      inputMode="numeric"
                      value={row.zona}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                        setZonaRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, zona: v } : r
                          )
                        );
                      }}
                      placeholder="001"
                      className="w-24 border-white/15 bg-slate-950 text-white"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">
                      Seções nesta zona
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={row.secoes || ""}
                      onChange={(e) => {
                        const n = Number.parseInt(
                          e.target.value.replace(/\D/g, "") || "0",
                          10
                        );
                        setZonaRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, secoes: n } : r
                          )
                        );
                      }}
                      className="w-28 border-white/15 bg-slate-950 text-white"
                      disabled={busy}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mb-0.5 text-red-300"
                    onClick={() =>
                      setZonaRows((rows) => rows.filter((_, i) => i !== idx))
                    }
                    disabled={busy || zonaRows.length <= 1}
                    aria-label="Remover zona"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Soma das zonas:{" "}
              {zonaRows.reduce(
                (s, r) => s + (Number.isFinite(r.secoes) ? r.secoes : 0),
                0
              )}{" "}
              seções
            </p>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar expectativa
          </Button>
        </form>
      )}

      {!loading && tab === "relatorio" && (
        <form
          onSubmit={(e) => void handleSaveRelatorio(e)}
          className="space-y-4 rounded-xl border border-white/10 bg-slate-900/50 p-4"
        >
          <p className="text-sm text-slate-300">
            Escolha quais cargos aparecem no telão (rankings, gráfico e foco do
            painel). Salvo no banco para sincronizar todas as TVs; também em
            localStorage neste aparelho.
          </p>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={relatorioTodos}
              onChange={(e) => {
                setRelatorioTodos(e.target.checked);
                if (e.target.checked) {
                  setRelatorioCargos([...CARGOS_OFICIAIS]);
                }
              }}
              className="size-4 accent-[#00ADEF]"
              disabled={busy}
            />
            <span className="font-semibold text-white">Todos os cargos</span>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            {CARGOS_OFICIAIS.map((cargo) => {
              const checked =
                relatorioTodos || relatorioCargos.includes(cargo);
              return (
                <label
                  key={cargo}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5",
                    checked
                      ? "border-[#00ADEF]/40 bg-[#003B7E]/40"
                      : "border-white/10 bg-slate-950/40",
                    relatorioTodos && "opacity-70"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy || relatorioTodos}
                    onChange={(e) => {
                      setRelatorioCargos((prev) =>
                        e.target.checked
                          ? [...prev, cargo]
                          : prev.filter((c) => c !== cargo)
                      );
                    }}
                    className="size-4 accent-[#00ADEF]"
                  />
                  <span className="text-sm font-medium text-white">
                    {cargo}
                  </span>
                </label>
              );
            })}
          </div>

          <Button
            type="submit"
            disabled={busy || (!relatorioTodos && relatorioCargos.length === 0)}
            className="bg-[#00ADEF] text-[#001a3a] hover:bg-[#33c0f3]"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Aplicar no telão
          </Button>
        </form>
      )}
    </div>
  );
}
