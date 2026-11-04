"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  rotuloDia,
  somarDias,
} from "@/lib/datas";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";

// Célula aberta para escolher quem trabalha.
type CelulaAberta = { data: string; turno: Turno };

const CAMPOS_ESCALA = "id, data, turno_id, funcionario_id";

async function buscarEscalas(segunda: string): Promise<Escala[]> {
  const { data, error } = await supabase()
    .from("escalas")
    .select(CAMPOS_ESCALA)
    .gte("data", segunda)
    .lte("data", somarDias(segunda, 6));
  if (error) throw error;
  return data ?? [];
}

// A data de hoje vem do celular (no servidor não há "hoje": fica vazio).
const nadaParaOuvir = () => () => {};
function useHoje(): string {
  return useSyncExternalStore(nadaParaOuvir, hojeISO, () => "");
}

export default function EscalaDaSemana() {
  const semVariaveis = !variaveisConfiguradas();
  const hoje = useHoje();
  // Quantas semanas para frente (+) ou para trás (-) da semana atual.
  const [deslocamento, setDeslocamento] = useState(0);
  const segunda = hoje ? somarDias(inicioDaSemana(hoje), 7 * deslocamento) : null;

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [cadastrosCarregados, setCadastrosCarregados] = useState(false);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [semanaCarregada, setSemanaCarregada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const fecharCelula = useCallback(() => setCelula(null), []);

  const carregando = !cadastrosCarregados || semanaCarregada !== segunda;

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    if (semVariaveis) return;
    async function carregarCadastros() {
      try {
        const db = supabase();
        const [t, f] = await Promise.all([
          db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
          db
            .from("funcionarios")
            .select("id, nome, funcao, telefone, cpf, ativo")
            .order("funcao")
            .order("nome"),
        ]);
        if (t.error) throw t.error;
        if (f.error) throw f.error;
        setTurnos(t.data ?? []);
        setFuncionarios(f.data ?? []);
      } catch (e) {
        setErro(mensagemDeErro(e));
      } finally {
        setCadastrosCarregados(true);
      }
    }
    carregarCadastros();
  }, [semVariaveis]);

  // Escala da semana visível: recarrega ao trocar de semana.
  useEffect(() => {
    if (semVariaveis || !segunda) return;
    let valido = true; // ignora respostas de uma semana que já saiu da tela
    buscarEscalas(segunda)
      .then((lista) => {
        if (!valido) return;
        setEscalas(lista);
        setErro(null);
      })
      .catch((e) => {
        if (valido) setErro(mensagemDeErro(e));
      })
      .finally(() => {
        if (valido) setSemanaCarregada(segunda);
      });
    return () => {
      valido = false;
    };
  }, [segunda, semVariaveis]);

  const dias = segunda ? diasDaSemana(segunda) : [];
  const nomePorId = new Map(funcionarios.map((f) => [f.id, f]));

  function escaladosNa(data: string, turnoId: string): Funcionario[] {
    return escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => nomePorId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async function alternar(f: Funcionario, data: string, turnoId: string) {
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turnoId && e.funcionario_id === f.id,
    );
    setSalvandoId(f.id);
    setErro(null);
    try {
      if (existente) {
        const { error } = await supabase().from("escalas").delete().eq("id", existente.id);
        if (error) throw error;
        setEscalas((lista) => lista.filter((e) => e.id !== existente.id));
      } else {
        const { data: nova, error } = await supabase()
          .from("escalas")
          .insert({ data, turno_id: turnoId, funcionario_id: f.id })
          .select(CAMPOS_ESCALA)
          .single();
        if (error) throw error;
        setEscalas((lista) => [...lista, nova]);
      }
    } catch (e) {
      const mensagem = mensagemDeErro(e);
      // Em caso de erro, recarrega para mostrar o que está de fato salvo.
      if (segunda) {
        try {
          setEscalas(await buscarEscalas(segunda));
        } catch {
          // mantém a mensagem do erro original
        }
      }
      setErro(mensagem);
    } finally {
      setSalvandoId(null);
    }
  }

  if (semVariaveis) return <AvisoSemVariaveis />;

  const tituloSemana = segunda
    ? `${diaMes(segunda)} a ${diaMes(somarDias(segunda, 6))}`
    : "";
  const ehSemanaAtual = deslocamento === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Escala da semana</h1>
        <p className="text-lg text-neutral-700">{tituloSemana}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1"
          onClick={() => setDeslocamento((d) => d - 1)}
          disabled={!segunda}
          aria-label="Semana anterior"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1"
          onClick={() => setDeslocamento(0)}
          disabled={!segunda || ehSemanaAtual}
        >
          Hoje
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1"
          onClick={() => setDeslocamento((d) => d + 1)}
          disabled={!segunda}
          aria-label="Próxima semana"
        >
          Próxima ▶
        </button>
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      {turnos.length === 0 && !carregando && !erro ? (
        <p className="cartao text-neutral-600">
          Nenhum turno cadastrado no banco. Rode o supabase/schema.sql no Supabase.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Toque num quadro para escolher quem trabalha. Arraste a grade para o lado para
            ver todos os dias.
          </p>
          <div
            className={`cartao overflow-x-auto p-0 ${carregando ? "opacity-60" : ""}`}
            aria-busy={carregando}
          >
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] min-w-[92px] border-b border-r border-neutral-200 bg-white p-2 text-sm font-semibold">
                    Turno
                  </th>
                  {dias.map((dia) => (
                    <th
                      key={dia}
                      className={`min-w-[112px] border-b border-neutral-200 p-2 text-center text-sm font-semibold ${
                        dia === hoje ? "bg-amber-50" : ""
                      }`}
                    >
                      {rotuloDia(dia)}
                      {dia === hoje && (
                        <span className="block text-xs font-normal text-amber-700">hoje</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnos.map((turno) => (
                  <tr key={turno.id}>
                    <th className="sticky left-0 z-[1] border-b border-r border-neutral-200 bg-white p-2 align-top">
                      <span className="block font-semibold">{turno.nome}</span>
                      <span className="block text-xs font-normal text-neutral-600">
                        {horaCurta(turno.hora_inicio)} às {horaCurta(turno.hora_fim)}
                      </span>
                    </th>
                    {dias.map((dia) => {
                      const escalados = escaladosNa(dia, turno.id);
                      return (
                        <td
                          key={dia}
                          className={`border-b border-neutral-200 p-1 align-top ${
                            dia === hoje ? "bg-amber-50" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setCelula({ data: dia, turno })}
                            className="flex min-h-[96px] w-full flex-col items-stretch gap-1 rounded-xl border border-dashed border-neutral-300 p-2 text-left active:bg-neutral-100"
                            aria-label={`${turno.nome}, ${rotuloDia(dia)}: ${
                              escalados.length
                            } pessoas. Tocar para escolher.`}
                          >
                            {escalados.length === 0 ? (
                              <span className="m-auto text-sm text-neutral-500">
                                + Escolher
                              </span>
                            ) : (
                              <>
                                {escalados.map((f) => (
                                  <span
                                    key={f.id}
                                    className="truncate rounded-md bg-neutral-100 px-2 py-1 text-sm"
                                  >
                                    {primeiroNome(f.nome)}
                                  </span>
                                ))}
                                <span className="mt-auto text-xs text-neutral-500">
                                  {escalados.length}{" "}
                                  {escalados.length === 1 ? "pessoa" : "pessoas"}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {celula && (
        <EscolherEquipe
          celula={celula}
          funcionarios={funcionarios}
          escalados={escaladosNa(celula.data, celula.turno.id)}
          salvandoId={salvandoId}
          erro={erro}
          onAlternar={(f) => alternar(f, celula.data, celula.turno.id)}
          onFechar={fecharCelula}
        />
      )}
    </div>
  );
}

function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0];
}

// Painel que sobe de baixo da tela com a lista de funcionários para marcar.
function EscolherEquipe({
  celula,
  funcionarios,
  escalados,
  salvandoId,
  erro,
  onAlternar,
  onFechar,
}: {
  celula: CelulaAberta;
  funcionarios: Funcionario[];
  escalados: Funcionario[];
  salvandoId: string | null;
  erro: string | null;
  onAlternar: (f: Funcionario) => void;
  onFechar: () => void;
}) {
  const idsEscalados = new Set(escalados.map((f) => f.id));
  // Mostra os ativos e também quem está desativado mas já estava escalado aqui,
  // para poder tirar da escala.
  const lista = funcionarios.filter((f) => f.ativo || idsEscalados.has(f.id));

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    const overflowAntigo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntigo;
    };
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quem trabalha no ${celula.turno.nome}, ${rotuloDia(celula.data)}`}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 p-4">
          <p className="text-lg font-bold">
            {celula.turno.nome} · {rotuloDia(celula.data)}
          </p>
          <p className="text-sm text-neutral-600">
            {horaCurta(celula.turno.hora_inicio)} às {horaCurta(celula.turno.hora_fim)} ·{" "}
            {escalados.length} {escalados.length === 1 ? "pessoa escalada" : "pessoas escaladas"}
          </p>
        </div>

        <ul className="flex-1 overflow-y-auto p-2">
          {lista.length === 0 && (
            <li className="p-3 text-neutral-600">
              Nenhum funcionário ativo. Cadastre na tela Equipe.
            </li>
          )}
          {lista.map((f) => {
            const marcado = idsEscalados.has(f.id);
            const salvando = salvandoId === f.id;
            return (
              <li key={f.id}>
                <label
                  className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2 active:bg-neutral-100 ${
                    marcado ? "bg-neutral-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0"
                    style={{ accentColor: "var(--cor-principal)" }}
                    checked={marcado}
                    disabled={salvandoId !== null}
                    onChange={() => onAlternar(f)}
                  />
                  <span className="flex-1">
                    <span className="block font-medium">
                      {f.nome}
                      {!f.ativo && (
                        <span className="ml-1 text-sm text-neutral-500">(desativado)</span>
                      )}
                    </span>
                    <span className="block text-sm text-neutral-600">{f.funcao}</span>
                  </span>
                  {salvando && <span className="text-sm text-neutral-500">Salvando...</span>}
                </label>
              </li>
            );
          })}
        </ul>

        {erro && (
          <p className="px-4 pb-2 text-sm text-red-700" role="alert">
            Não foi possível salvar. Detalhe: {erro}
          </p>
        )}

        <div className="border-t border-neutral-200 p-4">
          <button type="button" className="botao w-full" onClick={onFechar}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
