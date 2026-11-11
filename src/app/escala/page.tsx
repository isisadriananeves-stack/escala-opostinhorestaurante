"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import {
  CAMPOS_FUNCIONARIO_ESCALA,
  type Escala,
  type FuncionarioEscala as Funcionario,
  type RespostaSugestao,
  type Turno,
} from "@/lib/tipos";
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
import { PropostaEscala, diferencaDaProposta } from "@/components/PropostaEscala";
import { REGRAS } from "@/config/regras";
import {
  calcularAlertas,
  chaveCelula,
  conferirMinimo,
  periodoParaConferir,
  regraDoQuadro,
  ROTULO_TIPO,
  type Alerta,
  type ResultadoAlertas,
} from "@/lib/alertas";

// Célula aberta para escolher quem trabalha.
type CelulaAberta = { data: string; turno: Turno };

const CAMPOS_ESCALA = "id, data, turno_id, funcionario_id";

// Carrega a semana e os dias ao redor que as regras precisam
// (domingo anterior, segunda seguinte e os domingos do mês).
async function buscarEscalas(segunda: string): Promise<Escala[]> {
  const { inicio, fim } = periodoParaConferir(segunda);
  const { data, error } = await supabase()
    .from("escalas")
    .select(CAMPOS_ESCALA)
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return data ?? [];
}

// Pede à IA (pela rota do servidor) uma sugestão para a semana. Não salva nada.
async function pedirSugestao(segunda: string): Promise<RespostaSugestao> {
  // Envia o "crachá" do login: a rota só responde para quem está conectado.
  const { data: sessao } = await supabase().auth.getSession();
  const token = sessao.session?.access_token;
  let resposta: Response;
  try {
    resposta = await fetch("/api/escala/sugerir", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ segunda }),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (!resposta.ok) {
    let erro = `erro ${resposta.status}`;
    if (resposta.status === 504) erro = "A IA demorou demais para responder. Tente de novo.";
    try {
      const corpo = (await resposta.json()) as { erro?: string };
      if (corpo.erro) erro = corpo.erro;
    } catch {
      // sem detalhe
    }
    throw new Error(erro);
  }
  return (await resposta.json()) as RespostaSugestao;
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

  // Sugestão da IA: fica na tela até o dono aprovar ou descartar.
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const [proposta, setProposta] = useState<{ segunda: string; dados: RespostaSugestao } | null>(
    null,
  );
  const [salvandoProposta, setSalvandoProposta] = useState(false);
  const [erroProposta, setErroProposta] = useState<string | null>(null);
  const descartarProposta = useCallback(() => {
    setProposta(null);
    setErroProposta(null);
  }, []);

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
            .select(CAMPOS_FUNCIONARIO_ESCALA)
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

  async function sugerir() {
    if (!segunda) return;
    setSugerindo(true);
    setErroSugestao(null);
    try {
      const dados = await pedirSugestao(segunda);
      setErroProposta(null);
      setProposta({ segunda, dados });
    } catch (e) {
      setErroSugestao(mensagemDeErro(e));
    } finally {
      setSugerindo(false);
    }
  }

  // Grava só a diferença: primeiro quem entra, depois tira quem sai.
  async function aprovarProposta() {
    if (!proposta) return;
    const semanaDaProposta = proposta.segunda;
    setSalvandoProposta(true);
    setErroProposta(null);
    try {
      const { entram, saem } = diferencaDaProposta(
        proposta.dados.escalas,
        escalas,
        semanaDaProposta,
      );
      if (entram.length > 0) {
        const { error } = await supabase().from("escalas").insert(entram);
        if (error) throw error;
      }
      if (saem.length > 0) {
        const { error } = await supabase()
          .from("escalas")
          .delete()
          .in(
            "id",
            saem.map((e) => e.id),
          );
        if (error) throw error;
      }
      setEscalas(await buscarEscalas(semanaDaProposta));
      setProposta(null);
    } catch (e) {
      const mensagem = mensagemDeErro(e);
      // Recarrega para a proposta comparar com o que está de fato salvo.
      try {
        setEscalas(await buscarEscalas(semanaDaProposta));
      } catch {
        // mantém a mensagem do erro original
      }
      setErroProposta(mensagem);
    } finally {
      setSalvandoProposta(false);
    }
  }

  if (semVariaveis) return <AvisoSemVariaveis />;

  const resultado: ResultadoAlertas | null =
    segunda && !carregando
      ? calcularAlertas({ regras: REGRAS, segunda, turnos, funcionarios, escalas })
      : null;

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
          disabled={!segunda || sugerindo}
          aria-label="Semana anterior"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1"
          onClick={() => setDeslocamento(0)}
          disabled={!segunda || ehSemanaAtual || sugerindo}
        >
          Hoje
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1"
          onClick={() => setDeslocamento((d) => d + 1)}
          disabled={!segunda || sugerindo}
          aria-label="Próxima semana"
        >
          Próxima ▶
        </button>
      </div>

      {turnos.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            className="botao w-full"
            onClick={sugerir}
            disabled={!segunda || carregando || sugerindo}
          >
            {sugerindo ? "Montando a sugestão..." : "✨ Sugerir escala"}
          </button>
          <p className="text-center text-sm text-neutral-600">
            {sugerindo
              ? "A IA está montando a semana. Pode levar até 2 minutos."
              : "A IA propõe a semana na tela seguindo as regras da casa. Nada é salvo sem você aprovar."}
          </p>
          {erroSugestao && (
            <p className="cartao border-red-300 bg-red-50! shadow-none! text-red-800" role="alert">
              Não foi possível sugerir a escala. Detalhe: {erroSugestao}
            </p>
          )}
        </div>
      )}

      {erro && <AvisoErro mensagem={erro} />}

      {resultado && turnos.length > 0 && <ResumoAlertas resultado={resultado} />}

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
                  <th className="titulo sticky left-0 z-[1] min-w-[92px] border-b border-r border-neutral-200 bg-white p-2 text-base">
                    Turno
                  </th>
                  {dias.map((dia) => (
                    <th
                      key={dia}
                      className={`titulo min-w-[112px] border-b border-neutral-200 p-2 text-center text-base ${
                        dia === hoje ? "bg-amber-50" : ""
                      }`}
                    >
                      {rotuloDia(dia)}
                      {dia === hoje && (
                        <span className="block font-sans text-xs font-semibold text-amber-700">hoje</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnos.map((turno) => (
                  <tr key={turno.id}>
                    <th className="sticky left-0 z-[1] border-b border-r border-neutral-200 bg-white p-2 align-top">
                      <span className="titulo block text-lg">{turno.nome}</span>
                      <span className="block text-xs font-normal text-neutral-600">
                        {horaCurta(turno.hora_inicio)} às {horaCurta(turno.hora_fim)}
                      </span>
                    </th>
                    {dias.map((dia) => {
                      const escalados = escaladosNa(dia, turno.id);
                      const alertasDoQuadro =
                        resultado?.porCelula.get(chaveCelula(dia, turno.id)) ?? [];
                      const comAlerta = alertasDoQuadro.length > 0;
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
                            className={`flex min-h-[96px] w-full flex-col items-stretch gap-1 rounded-xl p-2 text-left ${
                              comAlerta
                                ? "border-2 border-red-600 bg-red-50 active:bg-red-100"
                                : "border border-dashed border-neutral-300 active:bg-neutral-100"
                            }`}
                            aria-label={`${turno.nome}, ${rotuloDia(dia)}: ${
                              escalados.length
                            } pessoas${
                              comAlerta ? `, ${alertasDoQuadro.length} alertas` : ""
                            }. Tocar para escolher.`}
                          >
                            {comAlerta && (
                              <span className="space-y-0.5 text-xs font-semibold leading-snug text-red-700">
                                {alertasDoQuadro.map((a, i) => (
                                  <span key={i} className="block">
                                    ⚠ {a.curto}
                                  </span>
                                ))}
                              </span>
                            )}
                            {escalados.length === 0 ? (
                              <span
                                className={`m-auto text-sm ${
                                  comAlerta ? "text-red-700" : "text-neutral-500"
                                }`}
                              >
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
          alertas={resultado?.porCelula.get(chaveCelula(celula.data, celula.turno.id)) ?? []}
          salvandoId={salvandoId}
          erro={erro}
          onAlternar={(f) => alternar(f, celula.data, celula.turno.id)}
          onFechar={fecharCelula}
        />
      )}

      {proposta && proposta.segunda === segunda && (
        <PropostaEscala
          proposta={proposta.dados}
          segunda={proposta.segunda}
          turnos={turnos}
          funcionarios={funcionarios}
          escalasAtuais={escalas}
          salvando={salvandoProposta}
          erro={erroProposta}
          onAprovar={aprovarProposta}
          onDescartar={descartarProposta}
        />
      )}
    </div>
  );
}

// Resumo no topo da grade: quantos alertas a semana tem, com a lista ao tocar.
function ResumoAlertas({ resultado }: { resultado: ResultadoAlertas }) {
  const { alertas, semSexo } = resultado;
  const total = alertas.length;
  return (
    <section
      className={`cartao ${total > 0 ? "border-red-300 bg-red-50! shadow-none!" : "border-green-300 bg-green-50! shadow-none!"}`}
      aria-live="polite"
    >
      {total === 0 ? (
        <p className="text-lg font-semibold text-green-800">✓ Nenhum alerta nesta semana</p>
      ) : (
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1">
            <span className="text-lg font-semibold text-red-800">
              ⚠ {total} {total === 1 ? "alerta" : "alertas"} nesta semana
            </span>
            <span className="shrink-0 text-sm font-semibold text-red-800 underline">
              Ver lista
            </span>
          </summary>
          <ul className="mt-3 space-y-2">
            {alertas.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-red-900">
                <span aria-hidden>•</span>
                <span>
                  <span className="font-semibold">{ROTULO_TIPO[a.tipo]}:</span> {a.texto}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {semSexo.length > 0 && (
        <p className="mt-2 text-sm text-amber-800">
          Regra dos domingos não conferida para quem está sem sexo cadastrado:{" "}
          {semSexo.map((f) => f.nome).join(", ")}. Ajuste na tela Equipe.
        </p>
      )}
    </section>
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
  alertas,
  salvandoId,
  erro,
  onAlternar,
  onFechar,
}: {
  celula: CelulaAberta;
  funcionarios: Funcionario[];
  escalados: Funcionario[];
  alertas: Alerta[];
  salvandoId: string | null;
  erro: string | null;
  onAlternar: (f: Funcionario) => void;
  onFechar: () => void;
}) {
  const idsEscalados = new Set(escalados.map((f) => f.id));
  // Mostra os ativos e também quem está desativado mas já estava escalado aqui,
  // para poder tirar da escala.
  const lista = funcionarios.filter((f) => f.ativo || idsEscalados.has(f.id));
  const regra = regraDoQuadro(REGRAS, celula.turno, celula.data);
  const contagem = regra ? conferirMinimo(regra, escalados) : [];

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
          <p className="titulo text-xl" style={{ color: "var(--cor-principal)" }}>
            {celula.turno.nome} · {rotuloDia(celula.data)}
          </p>
          <p className="text-sm text-neutral-600">
            {horaCurta(celula.turno.hora_inicio)} às {horaCurta(celula.turno.hora_fim)} ·{" "}
            {escalados.length} {escalados.length === 1 ? "pessoa escalada" : "pessoas escaladas"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
        {(regra || alertas.length > 0) && (
          <div className="space-y-2 border-b border-neutral-200 p-4">
            {alertas.map((a, i) => (
              <p key={i} className="text-sm font-semibold text-red-700">
                ⚠ {a.texto}
              </p>
            ))}
            {regra && (
              <div>
                <p className="text-sm font-semibold text-neutral-700">
                  Mínimo ({regra.descricao})
                </p>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {contagem.map((c) => {
                    const ok = c.tem >= c.minimo;
                    return (
                      <li key={c.funcao} className={ok ? "text-green-800" : "text-red-700"}>
                        {ok ? "✓" : "✗"} {c.funcao}: {c.tem}/{c.minimo}
                        {c.observacao && (
                          <span className="block text-xs text-neutral-500">{c.observacao}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        <ul className="p-2">
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
        </div>

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
