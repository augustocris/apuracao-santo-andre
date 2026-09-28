"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  MapPinned,
  MonitorPlay,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CARGO_DIGITOS,
  CARGO_SLOTS,
  CARGOS_OFICIAIS,
  CONFIG_STORAGE_KEY,
  labelCargoCurto,
  type CargoOficial,
} from "@/lib/cargos";
import {
  applyZonasExpectativa,
  getConfig,
  listCandidatos,
  removeCandidato,
  saveRelatorioCargos,
  saveSecoesEsperadas,
  upsertCandidato,
} from "@/lib/data";
import type { ApuracaoConfig, Candidato, ZonaConfigRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type CadastroTab = "candidatos" | "secoes" | "relatorio";

interface AdminCadastroProps {
  onConfigSaved?: () => void;
}

const EMPTY_ZONA: ZonaConfigRow = { zona: "", secoes: 1 };

export function AdminCadastro({ onConfigSaved }: AdminCadastroProps) {
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

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cands, cfg] = await Promise.all([
        listCandidatos({ activeRaceOnly: true }),
        getConfig(),
      ]);
      setCandidatos(cands);
      setConfig(cfg);
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
  }

  function startEdit(c: Candidato) {
    setEditId(c.id);
    setFormCargo(c.cargo as CargoOficial);
    setFormNumero(c.numero);
    setFormNome(c.nome);
    setTab("candidatos");
  }

  async function handleSaveCandidato(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await upsertCandidato({
        id: editId ?? undefined,
        numero: formNumero,
        nome: formNome,
        cargo: formCargo,
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
    { id: "candidatos", label: "Candidatos", icon: Users },
    { id: "secoes", label: "Zonas / Seções", icon: MapPinned },
    { id: "relatorio", label: "Relatório telão", icon: MonitorPlay },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:p-5">
      <div>
        <h2 className="text-lg font-bold text-white">Cadastro da apuração</h2>
        <p className="text-sm text-slate-400">
          Configure candidatos, expectativa de seções e o que aparece no telão.
          {config
            ? ` · ${config.secoes_esperadas} seções esperadas`
            : ""}
        </p>
      </div>

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
                  ? "bg-teal-600 text-white hover:bg-teal-600"
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

      {loading && (
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy}
                className="bg-teal-600 text-white hover:bg-teal-500"
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
                Nenhum candidato da corrida estadual ainda. Cadastre Governador,
                Senadores, Dep. Federal e Dep. Estadual.
              </p>
            ) : (
              <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
                {candidatos.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 bg-slate-900/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {c.nome}
                      </p>
                      <p className="text-xs text-slate-400">
                        {labelCargoCurto(c.cargo)} · Nº {c.numero}
                      </p>
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
              <code className="text-teal-300">locais_votacao</code> (nome
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
            className="bg-teal-600 text-white hover:bg-teal-500"
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
              className="size-4 accent-teal-500"
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
                      ? "border-teal-500/40 bg-teal-950/30"
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
                    className="size-4 accent-teal-500"
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
            className="bg-teal-600 text-white hover:bg-teal-500"
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
