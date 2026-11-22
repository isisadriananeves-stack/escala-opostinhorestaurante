"use client";

// Folgas da semana de cada funcionário ativo. Tocar num dia abre a janela para
// marcar os turnos da pessoa ou a folga (grava na mesma escala da Escala da semana).
// Folga = dia sem nenhum turno (mesma conta dos alertas da Escala, em src/lib/alertas.ts).

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import {
  CAMPOS_FOLGA_DOMINGO,
  CAMPOS_FUNCIONARIO_ESCALA,
  type Escala,
  type FolgaDomingo,
  type FuncionarioEscala as Funcionario,
  type Turno,
} from "@/lib/tipos";
import {
  DIAS_SEMANA_CURTO,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  somarDias,
} from "@/lib/datas";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";
import { REGRAS } from "@/config/regras";
import {
  calcularAlertas,
  diasDeFolga,
  normalizar,
  regraDoQuadro,
  type Alerta,
} from "@/lib/alertas";
import {
  descreverFolgaFixa,
  folgasPorPessoa,
  regraDaFolga,
  temFolgaFixa,
} from "@/lib/folgas-domingo";
import { buscarEscalas, escalar, tirarDaEscala } from "@/lib/escalas";

// Dia aberto para editar: de quem e qual dia.
type DiaAberto = { funcionarioId: string; dia: string };

// A data de hoje vem do celular (no servidor não há "hoje": fica vazio).
const nadaParaOuvir = () => () => {};
function useHoje(): string {
  return useSyncExternalStore(nadaParaOuvir, hojeISO, () => "");
}

/** "Almoço" -> "Alm". */
function abreviar(nomeTurno: string): string {
  return nomeTurno.trim().slice(0, 3);
}

/** "Qua", "Qua e Dom", "Seg, Qua e Dom". */
function listarDias(datas: string[]): string {
  const nomes = datas.map((d) => DIAS_SEMANA_CURTO[paraData(d).getDay()]);
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

type Linha = {
  funcionario: Funcionario;
  // Turnos de cada dia da semana (vazio = folga).
  turnosPorDia: Turno[][];
  folgas: string[];
  falta: number;
  folgaNoDomingo: boolean;
  // Regra de folga fixa de domingo da pessoa (se tiver) e se ela vale neste domingo.
  regraFixa: FolgaDomingo | null;
  folgaFixaHoje: boolean;
  avisosDomingo: string[];
};

export default function Folgas() {
  const semVariaveis = !variaveisConfiguradas();
  const hoje = useHoje();
  const [deslocamento, setDeslocamento] = useState(0);
  const inicioSemana = hoje ? somarDias(inicioDaSemana(hoje), 7 * deslocamento) : null;

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folgasFixas, setFolgasFixas] = useState<FolgaDomingo[]>([]);
  const [cadastrosCarregados, setCadastrosCarregados] = useState(false);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [semanaCarregada, setSemanaCarregada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<DiaAberto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroJanela, setErroJanela] = useState<string | null>(null);
  // Ordem dos cartões "congelada" ao abrir um dia, para o cartão não pular de lugar
  // enquanto você edita. Volta a ordenar ao trocar de semana.
  const [ordemCongelada, setOrdemCongelada] = useState<string[] | null>(null);
  const fecharJanela = useCallback(() => {
    setAberto(null);
    setErroJanela(null);
  }, []);

  const carregando = !cadastrosCarregados || semanaCarregada !== inicioSemana;

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    if (semVariaveis) return;
    const db = supabase();
    Promise.all([
      db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
      db.from("funcionarios").select(CAMPOS_FUNCIONARIO_ESCALA).order("nome"),
      db.from("folgas_domingo").select(CAMPOS_FOLGA_DOMINGO),
    ])
      .then(([t, f, fx]) => {
        if (t.error) throw t.error;
        if (f.error) throw f.error;
        if (fx.error) throw fx.error;
        setTurnos(t.data ?? []);
        setFuncionarios(f.data ?? []);
        setFolgasFixas(fx.data ?? []);
      })
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCadastrosCarregados(true));
  }, [semVariaveis]);

  // Escala da semana visível: recarrega ao trocar de semana.
  useEffect(() => {
    if (semVariaveis || !inicioSemana) return;
    let valido = true; // ignora respostas de uma semana que já saiu da tela
    buscarEscalas(inicioSemana)
      .then((lista) => {
        if (!valido) return;
        setEscalas(lista);
        setErro(null);
      })
      .catch((e) => {
        if (valido) setErro(mensagemDeErro(e));
      })
      .finally(() => {
        if (valido) setSemanaCarregada(inicioSemana);
      });
    return () => {
      valido = false;
    };
  }, [inicioSemana, semVariaveis]);

  function trocarSemana(novoDeslocamento: number) {
    setDeslocamento(novoDeslocamento);
    setOrdemCongelada(null);
    fecharJanela();
  }

  // Grava uma mudança e, se der erro, recarrega o que está de fato salvo.
  async function gravar(mudanca: () => Promise<void>) {
    setSalvando(true);
    setErroJanela(null);
    try {
      await mudanca();
    } catch (e) {
      setErroJanela(mensagemDeErro(e));
      if (inicioSemana) {
        try {
          setEscalas(await buscarEscalas(inicioSemana));
        } catch {
          // mantém a mensagem do erro original
        }
      }
    } finally {
      setSalvando(false);
    }
  }

  function alternarTurno(funcionarioId: string, dia: string, turnoId: string) {
    const existente = escalas.find(
      (e) => e.data === dia && e.turno_id === turnoId && e.funcionario_id === funcionarioId,
    );
    return gravar(async () => {
      if (existente) {
        await tirarDaEscala([existente.id]);
        setEscalas((lista) => lista.filter((e) => e.id !== existente.id));
      } else {
        const nova = await escalar(funcionarioId, dia, turnoId);
        setEscalas((lista) => [...lista, nova]);
      }
    });
  }

  function marcarFolga(funcionarioId: string, dia: string) {
    const ids = escalas
      .filter((e) => e.data === dia && e.funcionario_id === funcionarioId)
      .map((e) => e.id);
    return gravar(async () => {
      await tirarDaEscala(ids);
      setEscalas((lista) => lista.filter((e) => !ids.includes(e.id)));
    });
  }

  if (semVariaveis) return <AvisoSemVariaveis />;

  const dias = inicioSemana ? diasDaSemana(inicioSemana) : [];
  const domingo = dias[0];
  const minimo = REGRAS.folgasPorSemana;

  // Alertas da Escala para uma lista de escalas (a atual ou uma simulada).
  const alertasPara = (lista: Escala[]) =>
    calcularAlertas({
      regras: REGRAS,
      inicioSemana: inicioSemana ?? "",
      turnos,
      funcionarios,
      escalas: lista,
      folgasFixas,
    });

  // Alertas de domingo da Escala, por pessoa.
  const avisosDomingoPorPessoa = new Map<string, Alerta[]>();
  let semSexo: Funcionario[] = [];
  let alertasAtuais: Alerta[] = [];
  if (inicioSemana && !carregando) {
    const resultado = alertasPara(escalas);
    alertasAtuais = resultado.alertas;
    semSexo = resultado.semSexo;
    for (const a of resultado.alertas) {
      if ((a.tipo !== "domingo" && a.tipo !== "folga-fixa") || !a.funcionarioId) continue;
      avisosDomingoPorPessoa.set(a.funcionarioId, [
        ...(avisosDomingoPorPessoa.get(a.funcionarioId) ?? []),
        a,
      ]);
    }
  }
  const idsSemSexo = new Set(semSexo.map((f) => f.id));
  const mapaFolgas = folgasPorPessoa(folgasFixas);

  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const linhas: Linha[] = funcionarios
    .filter((f) => f.ativo)
    .map((f) => {
      const minhas = escalas.filter((e) => e.funcionario_id === f.id);
      const turnosPorDia = dias.map((d) =>
        minhas
          .filter((e) => e.data === d)
          .map((e) => turnoPorId.get(e.turno_id))
          .filter((t): t is Turno => Boolean(t))
          .sort((a, b) => a.ordem - b.ordem),
      );
      const folgas = diasDeFolga(dias, new Set(minhas.map((e) => e.data)));
      const regraFixa = mapaFolgas.get(f.id) ?? null;
      return {
        funcionario: f,
        turnosPorDia,
        folgas,
        falta: Math.max(0, minimo - folgas.length),
        folgaNoDomingo: folgas.includes(domingo),
        regraFixa,
        folgaFixaHoje: Boolean(regraFixa && domingo && regraDaFolga(regraFixa, domingo)),
        avisosDomingo: (avisosDomingoPorPessoa.get(f.id) ?? []).map((a) =>
          a.texto.replace(f.nome, "").trim(),
        ),
      };
    })
    .sort((a, b) => {
      if (ordemCongelada) {
        const pa = ordemCongelada.indexOf(a.funcionario.id);
        const pb = ordemCongelada.indexOf(b.funcionario.id);
        if (pa !== pb) return (pa < 0 ? Infinity : pa) - (pb < 0 ? Infinity : pb);
      }
      return (
        a.folgas.length - b.folgas.length ||
        a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR")
      );
    });

  function abrirDia(funcionarioId: string, dia: string) {
    setOrdemCongelada(linhas.map((l) => l.funcionario.id));
    setErroJanela(null);
    setAberto({ funcionarioId, dia });
  }

  const pessoaAberta = aberto ? funcionarios.find((f) => f.id === aberto.funcionarioId) : null;

  const abaixoDoMinimo = linhas.filter((l) => l.falta > 0).length;
  const folgamNoDomingo = linhas.filter((l) => l.folgaNoDomingo).length;
  const tituloSemana = inicioSemana
    ? `${diaMes(inicioSemana)} a ${diaMes(somarDias(inicioSemana, 6))}`
    : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Folgas da semana</h1>
        <p className="text-lg text-neutral-700">{tituloSemana}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => trocarSemana(deslocamento - 1)}
          disabled={!inicioSemana || salvando}
          aria-label="Semana anterior"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => trocarSemana(0)}
          disabled={!inicioSemana || deslocamento === 0 || salvando}
        >
          Hoje
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => trocarSemana(deslocamento + 1)}
          disabled={!inicioSemana || salvando}
          aria-label="Próxima semana"
        >
          Próxima ▶
        </button>
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      {carregando ? (
        <p className="text-neutral-600">Carregando folgas...</p>
      ) : linhas.length === 0 ? (
        <p className="cartao text-neutral-600">Nenhum funcionário ativo.</p>
      ) : (
        <>
          <section className="cartao space-y-1" aria-label="Resumo da semana">
            {abaixoDoMinimo > 0 ? (
              <p className="text-lg font-semibold text-red-800">
                ⚠ {abaixoDoMinimo} {abaixoDoMinimo === 1 ? "pessoa" : "pessoas"} com menos de{" "}
                {minimo} folgas
              </p>
            ) : (
              <p className="text-lg font-semibold text-green-800">
                ✓ Todos com pelo menos {minimo} folgas
              </p>
            )}
            <p className="text-neutral-700">
              Folgam no domingo: <strong>{folgamNoDomingo}</strong> de {linhas.length}
            </p>
            <p className="text-sm text-neutral-600">
              Folga é dia sem nenhum turno. Toque num dia para marcar turno ou folga.
            </p>
          </section>

          <ul className="space-y-3">
            {linhas.map((l) => (
              <CartaoFolgas
                key={l.funcionario.id}
                linha={l}
                dias={dias}
                semSexo={idsSemSexo.has(l.funcionario.id)}
                onAbrirDia={(dia) => abrirDia(l.funcionario.id, dia)}
              />
            ))}
          </ul>
        </>
      )}

      {aberto && pessoaAberta && inicioSemana && !carregando && (
        <EditarDia
          pessoa={pessoaAberta}
          dia={aberto.dia}
          turnos={turnos}
          funcionarios={funcionarios}
          escalas={escalas}
          folgaFixa={temFolgaFixa(mapaFolgas, pessoaAberta.id, aberto.dia)}
          regraFixa={mapaFolgas.get(pessoaAberta.id) ?? null}
          alertasAtuais={alertasAtuais}
          alertasPara={alertasPara}
          salvando={salvando}
          erro={erroJanela}
          onAlternar={(turnoId) => alternarTurno(pessoaAberta.id, aberto.dia, turnoId)}
          onFolga={() => marcarFolga(pessoaAberta.id, aberto.dia)}
          onFechar={fecharJanela}
        />
      )}
    </div>
  );
}

function CartaoFolgas({
  linha,
  dias,
  semSexo,
  onAbrirDia,
}: {
  linha: Linha;
  dias: string[];
  semSexo: boolean;
  onAbrirDia: (dia: string) => void;
}) {
  const { funcionario, turnosPorDia, folgas, falta, folgaNoDomingo, regraFixa, folgaFixaHoje, avisosDomingo } =
    linha;
  const qtd = folgas.length;
  return (
    <li className={`cartao space-y-3 ${falta > 0 ? "border-red-300 bg-red-50! shadow-none!" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{funcionario.nome}</p>
          <p className="text-neutral-700">{funcionario.funcao}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`titulo text-xl ${falta > 0 ? "text-red-800" : "text-green-800"}`}>
            {qtd} {qtd === 1 ? "folga" : "folgas"}
          </p>
          {falta > 0 && (
            <p className="text-sm font-semibold text-red-800">
              falta {falta} {falta === 1 ? "folga" : "folgas"}
            </p>
          )}
        </div>
      </div>

      <ol className="grid grid-cols-7 gap-1" aria-label={`Semana de ${funcionario.nome}`}>
        {dias.map((dia, i) => {
          const turnosDoDia = turnosPorDia[i] ?? [];
          const folga = turnosDoDia.length === 0;
          const ehDomingo = i === 0;
          const fixa = ehDomingo && folga && folgaFixaHoje;
          const nomeDia = DIAS_SEMANA_CURTO[paraData(dia).getDay()];
          return (
            <li key={dia} className="min-w-0">
              <button
                type="button"
                onClick={() => onAbrirDia(dia)}
                aria-label={`${funcionario.nome}, ${nomeDia} ${diaMes(dia)}: ${
                  fixa ? "folga fixa" : folga ? "folga" : turnosDoDia.map((t) => t.nome).join(" e ")
                }. Toque para mudar.`}
                className={`flex min-h-[64px] w-full flex-col items-center rounded-md border px-0 py-1 text-center active:scale-95 ${
                  folga
                    ? "border-green-400 bg-green-50 text-green-900"
                    : "border-neutral-200 bg-white text-neutral-700"
                } ${ehDomingo ? "ring-2 ring-detalhe ring-offset-1" : ""}`}
              >
              <span className="text-xs font-semibold">{nomeDia}</span>
              <span className="text-[11px] text-neutral-500">{diaMes(dia).slice(0, 2)}</span>
              <span className="mt-auto text-[10px] font-semibold leading-tight min-[360px]:text-xs">
                {fixa
                  ? "Fixa"
                  : folga
                  ? "Folga"
                  : turnosDoDia.map((t) => (
                      <span key={t.id} className="block">
                        {abreviar(t.nome)}
                      </span>
                    ))}
              </span>
              </button>
            </li>
          );
        })}
      </ol>

      {qtd > 0 && qtd < 7 && <p className="text-sm text-neutral-700">Folga: {listarDias(folgas)}</p>}

      <div className="space-y-1 text-sm">
        <p className={folgaNoDomingo ? "font-semibold text-green-800" : "text-neutral-700"}>
          {folgaNoDomingo && folgaFixaHoje
            ? "✓ Folga fixa no domingo"
            : folgaNoDomingo
            ? "✓ Folga no domingo"
            : "Trabalha no domingo"}
        </p>
        {regraFixa && (
          <p className="text-neutral-600">Folga fixa: {descreverFolgaFixa(regraFixa)}</p>
        )}
        {avisosDomingo.map((texto) => (
          <p key={texto} className="font-semibold text-red-800">
            ⚠ Domingo: {texto}
          </p>
        ))}
        {semSexo && (
          <p className="text-amber-700">Sexo não informado: a regra do domingo não é conferida.</p>
        )}
      </div>
    </li>
  );
}

/** Janela para marcar os turnos de uma pessoa num dia, ou a folga. */
function EditarDia({
  pessoa,
  dia,
  turnos,
  funcionarios,
  escalas,
  folgaFixa,
  regraFixa,
  alertasAtuais,
  alertasPara,
  salvando,
  erro,
  onAlternar,
  onFolga,
  onFechar,
}: {
  pessoa: Funcionario;
  dia: string;
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  folgaFixa: boolean;
  regraFixa: FolgaDomingo | null;
  alertasAtuais: Alerta[];
  alertasPara: (lista: Escala[]) => { alertas: Alerta[] };
  salvando: boolean;
  erro: string | null;
  onAlternar: (turnoId: string) => void;
  onFolga: () => void;
  onFechar: () => void;
}) {
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

  const nomeDia = DIAS_SEMANA_CURTO[paraData(dia).getDay()];
  const doDia = escalas.filter((e) => e.data === dia && e.funcionario_id === pessoa.id);
  const ehFolga = doDia.length === 0;
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const tirarNome = (texto: string) => texto.replace(pessoa.nome, "").replace(/^[:\s]+/, "").trim();
  const textosAtuais = new Set(
    alertasAtuais.filter((a) => a.funcionarioId === pessoa.id).map((a) => a.texto),
  );

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${pessoa.nome}, ${nomeDia} ${diaMes(dia)}`}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 p-4">
          <p className="titulo text-xl" style={{ color: "var(--cor-principal)" }}>
            {pessoa.nome.split(/\s+/)[0]} · {nomeDia} {diaMes(dia)}
          </p>
          <p className="text-sm text-neutral-600">
            {pessoa.funcao} · {ehFolga ? "de folga neste dia" : "trabalhando neste dia"}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {folgaFixa && (
            <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-900">
              <strong>Folga fixa neste domingo.</strong>
              {regraFixa && (
                <span className="block text-sm">Regra: {descreverFolgaFixa(regraFixa)}</span>
              )}
              {!ehFolga && (
                <span className="mt-1 block text-sm font-semibold text-red-700">
                  ⚠ Está escalado(a) mesmo assim: toque no turno para tirar.
                </span>
              )}
            </p>
          )}

          {turnos.map((turno) => {
            const existente = doDia.find((e) => e.turno_id === turno.id);
            const marcado = Boolean(existente);
            const travado = folgaFixa && !marcado;
            // Mínimo da função da pessoa neste turno.
            const regra = regraDoQuadro(REGRAS, turno, dia);
            const daFuncao = regra?.funcoes.find(
              (f) => normalizar(f.funcao) === normalizar(pessoa.funcao),
            );
            const colegas = escalas.filter(
              (e) =>
                e.data === dia &&
                e.turno_id === turno.id &&
                normalizar(porId.get(e.funcionario_id)?.funcao ?? "") === normalizar(pessoa.funcao),
            ).length;
            // Regras que passam a ser quebradas se marcar este turno (só aviso, salva igual).
            const novos =
              marcado || travado
                ? []
                : alertasPara([
                    ...escalas,
                    { id: "simulada", data: dia, turno_id: turno.id, funcionario_id: pessoa.id },
                  ])
                    .alertas.filter(
                      (a) => a.funcionarioId === pessoa.id && !textosAtuais.has(a.texto),
                    )
                    .map((a) => tirarNome(a.texto));
            return (
              <div key={turno.id} className="space-y-1">
                <button
                  type="button"
                  aria-pressed={marcado}
                  disabled={salvando || travado}
                  onClick={() => onAlternar(turno.id)}
                  className={`${marcado ? "botao" : "botao-secundario"} w-full justify-between! gap-3 text-left`}
                >
                  <span>
                    {marcado ? "✓ " : ""}
                    {turno.nome}
                  </span>
                  <span className="text-sm font-normal normal-case tracking-normal">
                    {horaCurta(turno.hora_inicio)}–{horaCurta(turno.hora_fim)}
                  </span>
                </button>
                {daFuncao && (
                  <p
                    className={`text-sm ${colegas >= daFuncao.minimo ? "text-green-800" : "text-red-700"}`}
                  >
                    {colegas >= daFuncao.minimo ? "✓" : "✗"} {pessoa.funcao} neste turno: {colegas} de{" "}
                    {daFuncao.minimo}
                  </p>
                )}
                {novos.map((texto) => (
                  <p key={texto} className="text-sm font-semibold text-amber-700">
                    ⚠ Se marcar: {texto}
                  </p>
                ))}
              </div>
            );
          })}

          <button
            type="button"
            aria-pressed={ehFolga}
            disabled={salvando || ehFolga}
            onClick={onFolga}
            className={`w-full rounded-lg border-2 px-5 py-3 font-semibold ${
              ehFolga
                ? "border-green-400 bg-green-50 text-green-900"
                : "border-green-600 bg-white text-green-800 active:bg-green-50"
            }`}
          >
            {ehFolga ? "✓ Folga neste dia" : "Marcar folga (tirar de todos os turnos)"}
          </button>

          {salvando && <p className="text-sm text-neutral-600">Salvando...</p>}
          {erro && (
            <p className="text-sm text-red-700" role="alert">
              Não foi possível salvar. Detalhe: {erro}
            </p>
          )}
        </div>

        <div className="border-t border-neutral-200 p-4">
          <button type="button" className="botao w-full" onClick={onFechar}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
