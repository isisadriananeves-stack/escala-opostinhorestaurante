"use client";

// Folgas da semana de cada funcionário ativo. Tocar num dia abre a janela para
// marcar os turnos da pessoa ou a folga (grava na mesma escala da Escala da semana).
// Folga = dia sem nenhum turno (mesma conta dos alertas da Escala, em src/lib/alertas.ts).

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import {
  CAMPOS_DIA_FECHADO,
  CAMPOS_FERIAS,
  CAMPOS_FOLGA_DOMINGO,
  CAMPOS_FUNCIONARIO_ESCALA,
  CAMPOS_TURNO,
  type DiaFechado,
  type Escala,
  type Ferias,
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
  paraData,
  somarDias,
} from "@/lib/datas";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";
import { antesDoInicio, podeVoltar, semanaMostrada } from "@/lib/semanas";
import { REGRAS } from "@/config/regras";
import {
  calcularAlertas,
  diasDeFolga,
  normalizar,
  regraDoQuadro,
  ROTULO_TIPO,
  type Alerta,
} from "@/lib/alertas";
import {
  descreverFolgaFixa,
  folgasPorPessoa,
  regraDaFolga,
  temFolgaFixa,
} from "@/lib/folgas-domingo";
import { buscarEscalas, escalar, escalarVarias, tirarDaEscala } from "@/lib/escalas";
import { motivoDoTurno, podeTrabalharNoTurno } from "@/lib/turnos";
import { descreverFerias, feriasNoDia, feriasPorPessoa } from "@/lib/ferias";
import { FolgasDoMes } from "@/components/FolgasDoMes";

// Dia aberto para editar: de quem e qual dia.
type DiaAberto = { funcionarioId: string; dia: string };

// "Modo folga" (tocar no dia troca entre folga e o turno padrão): a tela lembra
// a escolha neste aparelho. Se o navegador não deixar guardar, vale só até fechar.
const CHAVE_MODO_FOLGA = "folgas:modo-folga";
let modoFolgaNaMemoria = false;
const ouvintesModo = new Set<() => void>();
function lerModoFolga(): boolean {
  try {
    const salvo = localStorage.getItem(CHAVE_MODO_FOLGA);
    return salvo === null ? modoFolgaNaMemoria : salvo === "1";
  } catch {
    return modoFolgaNaMemoria;
  }
}
function gravarModoFolga(ligado: boolean) {
  modoFolgaNaMemoria = ligado;
  try {
    localStorage.setItem(CHAVE_MODO_FOLGA, ligado ? "1" : "0");
  } catch {
    // sem armazenamento: fica só na memória
  }
  ouvintesModo.forEach((avisar) => avisar());
}
function assinarModoFolga(avisar: () => void) {
  ouvintesModo.add(avisar);
  return () => {
    ouvintesModo.delete(avisar);
  };
}

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
  // Dias de férias da pessoa nesta semana e as férias em questão (se houver).
  diasDeFerias: Set<string>;
  feriasDaSemana: Ferias | null;
  // Avisos de regra da pessoa nesta semana (rótulo + frase sem o nome).
  avisosDomingo: { rotulo: string; texto: string }[];
};

export default function Folgas() {
  const semVariaveis = !variaveisConfiguradas();
  const hoje = useHoje();
  const [deslocamento, setDeslocamento] = useState(0);
  // "semana" = tela de montar a semana; "mes" = quantas folgas cada um teve no mês.
  const [visao, setVisao] = useState<"semana" | "mes">("semana");
  // Antes do início das escalas (REGRAS.inicioDasEscalas), abre na primeira semana com escala.
  const inicioSemana = hoje ? semanaMostrada(hoje, deslocamento) : null;

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folgasFixas, setFolgasFixas] = useState<FolgaDomingo[]>([]);
  const [diasFechados, setDiasFechados] = useState<DiaFechado[]>([]);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [cadastrosCarregados, setCadastrosCarregados] = useState(false);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [semanaCarregada, setSemanaCarregada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<DiaAberto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroJanela, setErroJanela] = useState<string | null>(null);
  // Recado no topo da tela (preencher semana, modo folga).
  const [avisoTopo, setAvisoTopo] = useState<{ ok: boolean; texto: string } | null>(null);
  const modoFolga = useSyncExternalStore(assinarModoFolga, lerModoFolga, () => false);
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
      db.from("turnos").select(CAMPOS_TURNO).order("ordem"),
      db.from("funcionarios").select(CAMPOS_FUNCIONARIO_ESCALA).order("nome"),
      db.from("folgas_domingo").select(CAMPOS_FOLGA_DOMINGO),
      db.from("dias_fechados").select(CAMPOS_DIA_FECHADO),
      db.from("ferias").select(CAMPOS_FERIAS),
    ])
      .then(([t, f, fx, df, fe]) => {
        if (t.error) throw t.error;
        if (f.error) throw f.error;
        if (fx.error) throw fx.error;
        if (df.error) throw df.error;
        setDiasFechados(df.data ?? []);
        if (fe.error) throw fe.error;
        setFerias(fe.data ?? []);
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
    setAvisoTopo(null);
    fecharJanela();
  }

  // Grava uma mudança e, se der erro, recarrega o que está de fato salvo.
  async function gravar(mudanca: () => Promise<void>) {
    setSalvando(true);
    setErroJanela(null);
    try {
      await mudanca();
    } catch (e) {
      // Com a janela do dia aberta, o erro aparece nela; senão, no topo da tela.
      if (aberto) setErroJanela(mensagemDeErro(e));
      else setAvisoTopo({ ok: false, texto: `Não foi possível salvar. Detalhe: ${mensagemDeErro(e)}` });
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
      diasFechados,
      ferias,
    });

  // Alertas da Escala de cada pessoa (domingo, folga fixa, dias seguidos...).
  // O de "folga" não entra aqui: o cartão já mostra quantas folgas faltam.
  const TIPOS_DO_CARTAO = new Set(["domingo", "folga-fixa", "dias-seguidos", "turno-funcao", "fechar-abrir"]);
  const avisosDomingoPorPessoa = new Map<string, Alerta[]>();
  let semSexo: Funcionario[] = [];
  let alertasAtuais: Alerta[] = [];
  if (inicioSemana && !carregando) {
    const resultado = alertasPara(escalas);
    alertasAtuais = resultado.alertas;
    semSexo = resultado.semSexo;
    for (const a of resultado.alertas) {
      if (!TIPOS_DO_CARTAO.has(a.tipo) || !a.funcionarioId) continue;
      avisosDomingoPorPessoa.set(a.funcionarioId, [
        ...(avisosDomingoPorPessoa.get(a.funcionarioId) ?? []),
        a,
      ]);
    }
  }
  const idsSemSexo = new Set(semSexo.map((f) => f.id));
  const mapaFolgas = folgasPorPessoa(folgasFixas);
  // Dias com o restaurante fechado (ex.: Natal): data -> motivo. Não contam como folga.
  const motivoFechado = new Map(diasFechados.map((d) => [d.data, d.motivo]));
  const fechados = new Set(motivoFechado.keys());
  const mapaFerias = feriasPorPessoa(ferias);

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
      // Dias de férias não são folga; semana com férias não cobra o mínimo de folgas.
      const diasDeFerias = new Set(dias.filter((d) => feriasNoDia(mapaFerias, f.id, d)));
      const folgas = diasDeFolga(dias, new Set(minhas.map((e) => e.data)), fechados).filter(
        (d) => !diasDeFerias.has(d),
      );
      const regraFixa = mapaFolgas.get(f.id) ?? null;
      return {
        funcionario: f,
        turnosPorDia,
        folgas,
        falta: diasDeFerias.size > 0 ? 0 : Math.max(0, minimo - folgas.length),
        diasDeFerias,
        feriasDaSemana:
          dias.map((d) => feriasNoDia(mapaFerias, f.id, d)).find((x) => x !== null) ?? null,
        folgaNoDomingo: folgas.includes(domingo),
        regraFixa,
        folgaFixaHoje: Boolean(regraFixa && domingo && regraDaFolga(regraFixa, domingo)),
        avisosDomingo: (avisosDomingoPorPessoa.get(f.id) ?? []).map((a) => ({
          rotulo: ROTULO_TIPO[a.tipo],
          texto: a.texto.replace(f.nome, "").trim(),
        })),
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

  const congelarOrdem = () => {
    if (!ordemCongelada) setOrdemCongelada(linhas.map((l) => l.funcionario.id));
  };

  // Turno padrão válido da pessoa (respeita o turno da função, ex.: Caixa).
  const turnoPadraoDe = (f: Funcionario): Turno | null => {
    const turno = f.turno_padrao ? turnoPorId.get(f.turno_padrao) : undefined;
    return turno && podeTrabalharNoTurno(f.funcao, turno, turnos) ? turno : null;
  };

  // Preencher semana: todo mundo trabalhando todos os dias no turno padrão,
  // menos folga fixa de domingo e dia fechado. Quem já tem escala na semana fica como está.
  function preencherSemana() {
    const novas: { data: string; turno_id: string; funcionario_id: string }[] = [];
    const semTurno: string[] = [];
    let pessoas = 0;
    let jaTinham = 0;
    for (const f of funcionarios.filter((p) => p.ativo)) {
      if (escalas.some((e) => e.funcionario_id === f.id && dias.includes(e.data))) {
        jaTinham++;
        continue;
      }
      const turno = turnoPadraoDe(f);
      if (!turno) {
        semTurno.push(f.nome.split(/\s+/)[0]);
        continue;
      }
      const daPessoa = dias
        .filter(
          (d) =>
            !fechados.has(d) &&
            !temFolgaFixa(mapaFolgas, f.id, d) &&
            !feriasNoDia(mapaFerias, f.id, d),
        )
        .map((d) => ({ data: d, turno_id: turno.id, funcionario_id: f.id }));
      if (daPessoa.length > 0) pessoas++;
      novas.push(...daPessoa);
    }
    const extras = [
      jaTinham > 0
        ? `${jaTinham} ${jaTinham === 1 ? "pessoa já tem" : "pessoas já têm"} escala nesta semana e ${jaTinham === 1 ? "fica" : "ficam"} como está.`
        : "",
      semTurno.length > 0 ? `Sem turno padrão (cadastre na tela Equipe): ${semTurno.join(", ")}.` : "",
    ].filter(Boolean);
    if (novas.length === 0) {
      setAvisoTopo({ ok: false, texto: ["Nada para preencher.", ...extras].join(" ") });
      return;
    }
    const pergunta = [
      `Vai marcar ${novas.length} turnos para ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}, no turno padrão de cada uma (menos folgas fixas de domingo, férias e dias fechados).`,
      ...extras,
      "Confirmar?",
    ].join("\n\n");
    if (!window.confirm(pergunta)) return;
    congelarOrdem();
    setAvisoTopo(null);
    return gravar(async () => {
      const criadas = await escalarVarias(novas);
      setEscalas((lista) => [...lista, ...criadas]);
      setAvisoTopo({
        ok: true,
        texto: [
          `Pronto: ${criadas.length} turnos marcados. Agora marque as folgas de cada pessoa.`,
          ...extras,
        ].join(" "),
      });
    });
  }

  // Modo folga: um toque troca o dia entre folga e o turno padrão.
  function alternarRapido(f: Funcionario, dia: string) {
    congelarOrdem();
    setAvisoTopo(null);
    const doDia = escalas.filter((e) => e.data === dia && e.funcionario_id === f.id);
    if (doDia.length > 0) return marcarFolga(f.id, dia);
    if (fechados.has(dia)) {
      setAvisoTopo({ ok: false, texto: `Restaurante fechado neste dia (${motivoFechado.get(dia)}).` });
      return;
    }
    const feriasDoDia = feriasNoDia(mapaFerias, f.id, dia);
    if (feriasDoDia) {
      setAvisoTopo({
        ok: false,
        texto: `${f.nome.split(/\s+/)[0]} está de férias ${descreverFerias(feriasDoDia)}.`,
      });
      return;
    }
    if (temFolgaFixa(mapaFolgas, f.id, dia)) {
      setAvisoTopo({ ok: false, texto: `${f.nome.split(/\s+/)[0]} tem folga fixa neste domingo.` });
      return;
    }
    const turno = turnoPadraoDe(f);
    // Sem turno padrão: abre a janela para escolher o turno.
    if (!turno) return abrirDia(f.id, dia);
    return gravar(async () => {
      const nova = await escalar(f.id, dia, turno.id);
      setEscalas((lista) => [...lista, nova]);
    });
  }

  const pessoaAberta = aberto ? funcionarios.find((f) => f.id === aberto.funcionarioId) : null;

  const abaixoDoMinimo = linhas.filter((l) => l.falta > 0).length;
  const folgamNoDomingo = linhas.filter((l) => l.folgaNoDomingo).length;
  const tituloSemana = inicioSemana
    ? `${diaMes(inicioSemana)} a ${diaMes(somarDias(inicioSemana, 6))}`
    : "";

  const escolherVisao = (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ver por">
      {(["semana", "mes"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={visao === v}
          className={`${visao === v ? "botao" : "botao-secundario"} px-2 py-2!`}
          onClick={() => {
            setVisao(v);
            fecharJanela();
          }}
        >
          {v === "semana" ? "Semana" : "Mês"}
        </button>
      ))}
    </div>
  );

  if (visao === "mes") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Folgas do mês</h1>
        {escolherVisao}
        {!cadastrosCarregados || !hoje ? (
          <p className="text-neutral-600">Carregando...</p>
        ) : (
          <FolgasDoMes
            hoje={hoje}
            funcionarios={funcionarios}
            ferias={ferias}
            diasFechados={diasFechados}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Folgas da semana</h1>
        <p className="text-lg text-neutral-700">{tituloSemana}</p>
      </div>

      {escolherVisao}

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => trocarSemana(deslocamento - 1)}
          disabled={!inicioSemana || !podeVoltar(inicioSemana) || salvando}
          aria-label="Semana anterior"
          title={inicioSemana && !podeVoltar(inicioSemana) ? "As escalas começam nesta semana" : undefined}
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => trocarSemana(0)}
          disabled={!inicioSemana || deslocamento === 0 || salvando}
        >
          {hoje && antesDoInicio(hoje) ? "Início" : "Hoje"}
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

          <section className="cartao space-y-3" aria-label="Montar a semana">
            <button
              type="button"
              className="botao w-full"
              onClick={preencherSemana}
              disabled={salvando}
            >
              Preencher semana
            </button>
            <p className="text-sm text-neutral-600">
              Marca todo mundo em todos os dias, no turno padrão de cada um (menos folgas fixas
              de domingo e dias fechados). Quem já tem escala nesta semana não muda.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={modoFolga}
              onClick={() => gravarModoFolga(!modoFolga)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left font-semibold ${
                modoFolga
                  ? "border-green-600 bg-green-50 text-green-900"
                  : "border-[color:var(--cor-borda)] bg-white text-neutral-800"
              }`}
            >
              <span>
                Modo folga
                <span className="block text-sm font-normal">
                  {modoFolga
                    ? "Ligado: um toque no dia troca entre folga e o turno padrão."
                    : "Desligado: tocar no dia abre a janela para escolher."}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  modoFolga ? "bg-green-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    modoFolga ? "left-6" : "left-1"
                  }`}
                />
              </span>
            </button>
            {salvando && <p className="text-sm text-neutral-600">Salvando...</p>}
            {avisoTopo && (
              <p
                className={`text-sm font-semibold ${avisoTopo.ok ? "text-green-800" : "text-red-700"}`}
                role={avisoTopo.ok ? "status" : "alert"}
              >
                {avisoTopo.texto}
              </p>
            )}
          </section>

          <ul className="space-y-3">
            {linhas.map((l) => (
              <CartaoFolgas
                key={l.funcionario.id}
                linha={l}
                dias={dias}
                semSexo={idsSemSexo.has(l.funcionario.id)}
                fechados={fechados}
                desabilitado={salvando}
                onAbrirDia={(dia) =>
                  modoFolga ? alternarRapido(l.funcionario, dia) : abrirDia(l.funcionario.id, dia)
                }
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
          fechado={motivoFechado.get(aberto.dia) ?? null}
          feriasDia={feriasNoDia(mapaFerias, pessoaAberta.id, aberto.dia)}
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
  fechados,
  desabilitado,
  onAbrirDia,
}: {
  linha: Linha;
  dias: string[];
  semSexo: boolean;
  fechados: Set<string>;
  desabilitado: boolean;
  onAbrirDia: (dia: string) => void;
}) {
  const {
    funcionario,
    turnosPorDia,
    folgas,
    falta,
    folgaNoDomingo,
    regraFixa,
    folgaFixaHoje,
    diasDeFerias,
    feriasDaSemana,
    avisosDomingo,
  } = linha;
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
          const fechado = folga && fechados.has(dia);
          // A folga fixa de domingo continua valendo mesmo nas férias (aparece como "Fixa").
          const fixa = !fechado && ehDomingo && folga && folgaFixaHoje;
          const emFerias = folga && !fechado && !fixa && diasDeFerias.has(dia);
          const nomeDia = DIAS_SEMANA_CURTO[paraData(dia).getDay()];
          return (
            <li key={dia} className="min-w-0">
              <button
                type="button"
                onClick={() => onAbrirDia(dia)}
                disabled={desabilitado}
                aria-label={`${funcionario.nome}, ${nomeDia} ${diaMes(dia)}: ${
                  fechado
                    ? "restaurante fechado"
                    : fixa
                    ? "folga fixa"
                    : emFerias
                    ? "férias"
                    : folga
                    ? "folga"
                    : turnosDoDia.map((t) => t.nome).join(" e ")
                }. Toque para mudar.`}
                className={`flex min-h-[64px] w-full flex-col items-center rounded-md border px-0 py-1 text-center active:scale-95 ${
                  fechado
                    ? "border-neutral-300 bg-neutral-100 text-neutral-500"
                    : emFerias
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : folga
                    ? "border-green-400 bg-green-50 text-green-900"
                    : "border-neutral-200 bg-white text-neutral-700"
                } ${ehDomingo ? "ring-2 ring-detalhe ring-offset-1" : ""}`}
              >
              <span className="text-xs font-semibold">{nomeDia}</span>
              <span className="text-[11px] text-neutral-500">{diaMes(dia).slice(0, 2)}</span>
              <span className="mt-auto text-[10px] font-semibold leading-tight min-[360px]:text-xs">
                {fechado
                  ? "Fech."
                  : fixa
                  ? "Fixa"
                  : emFerias
                  ? "Férias"
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
        {feriasDaSemana && (
          <p className="font-semibold text-sky-800">
            De férias {descreverFerias(feriasDaSemana)} (nesta semana não se cobra o mínimo de
            folgas)
          </p>
        )}
        {avisosDomingo.map((a) => (
          <p key={a.texto} className="font-semibold text-red-800">
            ⚠ {a.rotulo}: {a.texto}
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
  fechado,
  feriasDia,
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
  // Motivo, se o restaurante estiver fechado neste dia (ex.: "Natal").
  fechado: string | null;
  // Férias da pessoa que incluem este dia (se houver).
  feriasDia: Ferias | null;
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
            {pessoa.funcao} ·{" "}
            {fechado
              ? "restaurante fechado"
              : feriasDia
              ? "de férias"
              : ehFolga
              ? "de folga neste dia"
              : "trabalhando neste dia"}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {fechado && (
            <p className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-neutral-800">
              <strong>Restaurante fechado neste dia: {fechado}.</strong>
              <span className="block text-sm">
                Ninguém é escalado, e o dia não conta como folga.
              </span>
            </p>
          )}

          {feriasDia && (
            <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-900">
              <strong>De férias {descreverFerias(feriasDia)}.</strong>
              <span className="block text-sm">Não pode ser escalado(a) neste dia.</span>
            </p>
          )}

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
            const daPessoa = podeTrabalharNoTurno(pessoa.funcao, turno, turnos);
            // Turno de outra função (ex.: Caixa): não aparece, a não ser que já esteja marcado.
            if (!daPessoa && !marcado) return null;
            const travado = (folgaFixa || Boolean(fechado)) && !marcado;
            // Dia fechado: não mostra os turnos (a não ser um que já esteja marcado, para tirar).
            if ((fechado || feriasDia) && !marcado) return null;
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
                {!daPessoa && (
                  <p className="text-sm font-semibold text-red-700">
                    ⚠ Não é deste turno ({motivoDoTurno(pessoa.funcao, turno)}): toque para tirar
                  </p>
                )}
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

          {!fechado && !feriasDia && (
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
          )}

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
