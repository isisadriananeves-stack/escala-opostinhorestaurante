"use client";

import { useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { diaMes, hojeISO } from "@/lib/datas";
import {
  CAMPOS_FERIAS,
  CAMPOS_FUNCIONARIO_EQUIPE,
  CAMPOS_TURNO,
  FUNCOES_PADRAO,
  type FuncionarioEquipe as Funcionario,
  type Ferias,
  type ResumoAdmissoes,
  type Turno,
} from "@/lib/tipos";
import { descreverFerias, feriasAtuaisOuProximas } from "@/lib/ferias";
import { podeTrabalharNoTurno } from "@/lib/turnos";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";
import {
  NOME_MAXIMO,
  erroAdmissao,
  erroCpf,
  erroNome,
  erroTelefone,
  formatarTelefone,
  limparNome,
  mensagemDoBanco,
  mesAno,
} from "@/lib/validacao";

// Avisos que aparecem embaixo de cada campo.
type ErrosDoFormulario = { nome?: string; telefone?: string; cpf?: string; admissao?: string };

// Dados do formulário de adicionar/editar. Sem id = funcionário novo.
type Formulario = {
  id?: string;
  nome: string;
  funcao: string;
  telefone: string;
  // CPF novo digitado. Vazio na edição = manter o CPF que já está cadastrado.
  cpf: string;
  // 4 últimos números do CPF já cadastrado (só para mostrar).
  cpfFinalAtual: string | null;
  sexo: "" | "F" | "M";
  // Data de entrada no restaurante, "AAAA-MM-DD" (vazio = não informada).
  dataAdmissao: string;
  // Turno padrão (id do turno); vazio = sem turno padrão.
  turnoPadrao: string;
};

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  funcao: FUNCOES_PADRAO[0],
  telefone: "",
  cpf: "",
  cpfFinalAtual: null,
  sexo: "",
  dataAdmissao: "",
  turnoPadrao: "",
};

/** "12345678901" -> "123.456.789-01" (deixa como está se não tiver 11 dígitos). */
function formatarCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

const ROTULO_SEXO = { F: "Feminino", M: "Masculino" } as const;

/** Pede ao servidor para buscar no Pontomais as datas de entrada que faltam. */
async function buscarDatasNoPontomais(): Promise<ResumoAdmissoes> {
  const { data: sessao } = await supabase().auth.getSession();
  const token = sessao.session?.access_token;
  let resposta: Response;
  try {
    resposta = await fetch("/api/ponto/admissoes", {
      method: "POST",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(corpo?.erro ?? `O servidor respondeu com erro ${resposta.status}.`);
  }
  return corpo as ResumoAdmissoes;
}

function textoDoResumo(r: ResumoAdmissoes): string {
  const partes = [
    `${r.preenchidas} ${r.preenchidas === 1 ? "data preenchida" : "datas preenchidas"}`,
  ];
  if (r.jaTinham > 0) partes.push(`${r.jaTinham} já ${r.jaTinham === 1 ? "tinha" : "tinham"} data`);
  if (r.naoEncontrados > 0) {
    partes.push(
      `${r.naoEncontrados} não ${r.naoEncontrados === 1 ? "encontrada" : "encontradas"} no Pontomais (CPF diferente ou fora do Pontomais)`,
    );
  }
  if (r.semCpf > 0) partes.push(`${r.semCpf} sem CPF cadastrado aqui`);
  return partes.join(" · ") + ".";
}

async function buscarFuncionarios(): Promise<Funcionario[]> {
  const { data, error } = await supabase()
    .from("funcionarios")
    .select(CAMPOS_FUNCIONARIO_EQUIPE)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export default function Equipe() {
  const semVariaveis = !variaveisConfiguradas();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  // Pessoa com a janela de férias aberta.
  const [feriasDe, setFeriasDe] = useState<Funcionario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [buscandoDatas, setBuscandoDatas] = useState(false);
  const [resultadoDatas, setResultadoDatas] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  // Recarrega a lista depois de salvar, desativar ou reativar.
  async function carregar() {
    try {
      setFuncionarios(await buscarFuncionarios());
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  useEffect(() => {
    if (semVariaveis) return;
    Promise.all([
      buscarFuncionarios(),
      supabase().from("turnos").select(CAMPOS_TURNO).order("ordem"),
      supabase().from("ferias").select(CAMPOS_FERIAS).order("inicio"),
    ])
      .then(([lista, t, fe]) => {
        if (t.error) throw t.error;
        if (fe.error) throw fe.error;
        setFuncionarios(lista);
        setTurnos(t.data ?? []);
        setFerias(fe.data ?? []);
      })
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [semVariaveis]);

  // Funções da lista padrão + qualquer outra que já exista no banco.
  const funcoes = Array.from(
    new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]),
  );

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);
  const semDataDeEntrada = ativos.filter((f) => !f.data_admissao).length;

  async function puxarDatas() {
    setBuscandoDatas(true);
    setResultadoDatas(null);
    try {
      const resumo = await buscarDatasNoPontomais();
      setResultadoDatas({ ok: true, texto: textoDoResumo(resumo) });
      await carregar();
    } catch (e) {
      setResultadoDatas({ ok: false, texto: mensagemDeErro(e) });
    } finally {
      setBuscandoDatas(false);
    }
  }

  function abrirNovo() {
    setAviso(null);
    setErros({});
    setFormulario({ ...FORMULARIO_VAZIO });
  }

  function abrirEdicao(f: Funcionario) {
    setAviso(null);
    setErros({});
    setFormulario({
      id: f.id,
      nome: f.nome,
      funcao: f.funcao,
      telefone: f.telefone ?? "",
      cpf: "",
      cpfFinalAtual: f.cpf_final,
      sexo: f.sexo ?? "",
      dataAdmissao: f.data_admissao ?? "",
      turnoPadrao: f.turno_padrao ?? "",
    });
    // O formulário fica no topo da tela: rola até ele.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    const nome = limparNome(formulario.nome);
    const funcao = formulario.funcao.trim();
    const telefone = formatarTelefone(formulario.telefone);
    const cpf = formulario.cpf.replace(/\D/g, "");
    const novosErros: ErrosDoFormulario = {
      nome: erroNome(nome) ?? undefined,
      telefone: erroTelefone(telefone) ?? undefined,
      cpf: erroCpf(cpf) ?? undefined,
      admissao: erroAdmissao(formulario.dataAdmissao, hojeISO()) ?? undefined,
    };
    setErros(novosErros);
    if (novosErros.nome || novosErros.telefone || novosErros.cpf || novosErros.admissao) {
      setAviso("Confira os campos marcados.");
      return;
    }
    if (!funcao) {
      setAviso("Escolha a função.");
      return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const dados = {
        nome,
        funcao,
        telefone: telefone || null,
        sexo: formulario.sexo || null,
        data_admissao: formulario.dataAdmissao || null,
        turno_padrao: formulario.turnoPadrao || null,
        // Na edição, CPF vazio = manter o atual (o navegador nem conhece o CPF completo).
        ...(cpf ? { cpf } : formulario.id ? {} : { cpf: null }),
      };
      const db = supabase().from("funcionarios");
      const { error } = formulario.id
        ? await db.update(dados).eq("id", formulario.id)
        : await db.insert(dados);
      if (error) throw error;
      setFormulario(null);
      await carregar();
    } catch (e) {
      // O banco confere as mesmas regras: traduz a recusa para uma frase simples.
      setAviso(mensagemDoBanco(e) ?? `Não foi possível salvar. ${mensagemDeErro(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    if (!ativo && !window.confirm(`Desativar ${f.nome}? Ele(a) deixa de aparecer para escalar.`)) {
      return;
    }
    try {
      const { error } = await supabase()
        .from("funcionarios")
        .update({ ativo })
        .eq("id", f.id);
      if (error) throw error;
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  if (semVariaveis) return <AvisoSemVariaveis />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button type="button" className="botao" onClick={abrirNovo}>
            + Adicionar
          </button>
        )}
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      {formulario && (
        <form onSubmit={salvar} noValidate className="cartao space-y-4">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              maxLength={NOME_MAXIMO}
              aria-invalid={Boolean(erros.nome)}
              onChange={(e) => {
                setFormulario({ ...formulario, nome: e.target.value });
                setErros({ ...erros, nome: undefined });
              }}
              autoComplete="off"
              autoFocus
            />
            <span className="mt-1 flex justify-between gap-2 text-sm">
              <AvisoCampo texto={erros.nome} />
              <span className="ml-auto text-neutral-500">
                {limparNome(formulario.nome).length}/{NOME_MAXIMO}
              </span>
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => {
                const funcao = e.target.value;
                // Se o turno padrão não vale para a nova função (ex.: Caixa), limpa.
                const turno = turnos.find((t) => t.id === formulario.turnoPadrao);
                const turnoPadrao =
                  turno && podeTrabalharNoTurno(funcao, turno, turnos) ? formulario.turnoPadrao : "";
                setFormulario({ ...formulario, funcao, turnoPadrao });
              }}
            >
              {funcoes.map((funcao) => (
                <option key={funcao} value={funcao}>
                  {funcao}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Turno padrão</span>
            <span className="mb-2 block text-sm text-neutral-600">
              Turno em que a pessoa costuma trabalhar. Usado no &quot;Preencher semana&quot; da aba
              Folgas.
            </span>
            <select
              className="campo"
              value={formulario.turnoPadrao}
              onChange={(e) => setFormulario({ ...formulario, turnoPadrao: e.target.value })}
            >
              <option value="">Sem turno padrão</option>
              {turnos
                .filter((t) => podeTrabalharNoTurno(formulario.funcao, t, turnos))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 91234-5678"
              maxLength={15}
              aria-invalid={Boolean(erros.telefone)}
              value={formulario.telefone}
              onChange={(e) => {
                setFormulario({ ...formulario, telefone: formatarTelefone(e.target.value) });
                setErros({ ...erros, telefone: undefined });
              }}
            />
            <AvisoCampo texto={erros.telefone} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">CPF</span>
            <span className="mb-2 block text-sm text-neutral-600">
              {formulario.cpfFinalAtual
                ? `Cadastrado: final ${formulario.cpfFinalAtual}. Preencha só se quiser trocar.`
                : "Usado para ligar o funcionário às marcações do ponto."}
            </span>
            <input
              className="campo"
              inputMode="numeric"
              autoComplete="off"
              placeholder={formulario.cpfFinalAtual ? "Novo CPF (opcional)" : "000.000.000-00"}
              maxLength={14}
              aria-invalid={Boolean(erros.cpf)}
              value={formulario.cpf}
              onChange={(e) => {
                setFormulario({ ...formulario, cpf: e.target.value });
                setErros({ ...erros, cpf: undefined });
              }}
              onBlur={() => setFormulario({ ...formulario, cpf: formatarCpf(formulario.cpf) })}
            />
            <AvisoCampo texto={erros.cpf} />
          </label>
          <fieldset>
            <legend className="mb-1 font-medium">Sexo</legend>
            <p className="mb-2 text-sm text-neutral-600">Usado na regra de folga aos domingos.</p>
            <div className="grid grid-cols-2 gap-3">
              {(["F", "M"] as const).map((valor) => {
                const marcado = formulario.sexo === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={marcado}
                    className={marcado ? "botao" : "botao-secundario"}
                    onClick={() =>
                      setFormulario({ ...formulario, sexo: marcado ? "" : valor })
                    }
                  >
                    {ROTULO_SEXO[valor]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium">No Postinho desde</span>
            <span className="mb-2 block text-sm text-neutral-600">
              Data em que a pessoa entrou no restaurante. Aparece no crachá da tela Início.
            </span>
            <input
              className="campo"
              type="date"
              min="1950-01-01"
              max={hojeISO()}
              aria-invalid={Boolean(erros.admissao)}
              value={formulario.dataAdmissao}
              onChange={(e) => {
                setFormulario({ ...formulario, dataAdmissao: e.target.value });
                setErros({ ...erros, admissao: undefined });
              }}
            />
            {formulario.dataAdmissao && (
              <button
                type="button"
                className="mt-2 text-sm font-medium underline"
                style={{ color: "var(--cor-principal)" }}
                onClick={() => setFormulario({ ...formulario, dataAdmissao: "" })}
              >
                Apagar a data
              </button>
            )}
            <AvisoCampo texto={erros.admissao} />
          </label>
          {aviso && (
            <p className="text-red-700" role="alert">
              {aviso}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setFormulario(null)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {!carregando && !formulario && (semDataDeEntrada > 0 || resultadoDatas) && (
        <section className="cartao space-y-3">
          {semDataDeEntrada > 0 && (
            <p>
              <strong>
                {semDataDeEntrada} {semDataDeEntrada === 1 ? "pessoa está" : "pessoas estão"} sem a
                data de entrada.
              </strong>{" "}
              Dá para buscar a data de admissão no Pontomais (pelo CPF) ou preencher em
              &quot;Editar&quot;.
            </p>
          )}
          {resultadoDatas && (
            <p
              className={resultadoDatas.ok ? "text-green-700" : "text-red-700"}
              role={resultadoDatas.ok ? "status" : "alert"}
            >
              {resultadoDatas.texto}
            </p>
          )}
          {semDataDeEntrada > 0 && (
            <button
              type="button"
              className="botao w-full"
              onClick={puxarDatas}
              disabled={buscandoDatas}
            >
              {buscandoDatas ? "Buscando no Pontomais..." : "Buscar datas no Pontomais"}
            </button>
          )}
        </section>
      )}

      {feriasDe && (
        <JanelaFerias
          pessoa={feriasDe}
          lista={ferias.filter((x) => x.funcionario_id === feriasDe.id)}
          onMudou={async () => {
            const { data, error } = await supabase()
              .from("ferias")
              .select(CAMPOS_FERIAS)
              .order("inicio");
            if (!error) setFerias(data ?? []);
          }}
          onFechar={() => setFeriasDe(null)}
        />
      )}

      {carregando ? (
        <p className="text-neutral-600">Carregando equipe...</p>
      ) : (
        <>
          {ativos.length === 0 && !erro && (
            <p className="cartao text-neutral-600">
              Nenhum funcionário ativo. Toque em &quot;Adicionar&quot; para cadastrar.
            </p>
          )}
          <ul className="space-y-3">
            {ativos.map((f) => (
              <li key={f.id} className="cartao">
                <CartaoFuncionario
                  funcionario={f}
                  turnos={turnos}
                  ferias={ferias.filter((x) => x.funcionario_id === f.id)}
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => abrirEdicao(f)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => mudarAtivo(f, false)}
                  >
                    Desativar
                  </button>
                  <button
                    type="button"
                    className="botao-secundario col-span-2"
                    onClick={() => setFeriasDe(f)}
                  >
                    Férias
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {inativos.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-lg font-semibold text-neutral-600">
                Desativados ({inativos.length})
              </h2>
              <ul className="space-y-3">
                {inativos.map((f) => (
                  <li key={f.id} className="cartao opacity-75">
                    <CartaoFuncionario funcionario={f} turnos={turnos} />
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="botao-secundario"
                        onClick={() => abrirEdicao(f)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="botao-secundario"
                        onClick={() => mudarAtivo(f, true)}
                      >
                        Reativar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CartaoFuncionario({
  funcionario,
  turnos,
  ferias = [],
}: {
  funcionario: Funcionario;
  turnos: Turno[];
  ferias?: Ferias[];
}) {
  const turnoPadrao = turnos.find((t) => t.id === funcionario.turno_padrao);
  const proximas = feriasAtuaisOuProximas(ferias, hojeISO());
  return (
    <div>
      <p className="text-lg font-semibold">{funcionario.nome}</p>
      <p className="text-neutral-700">
        {funcionario.funcao}
        {funcionario.sexo ? (
          <span className="text-neutral-500"> · {ROTULO_SEXO[funcionario.sexo]}</span>
        ) : (
          <span className="text-amber-700"> · sexo não informado</span>
        )}
        {turnoPadrao ? (
          <span className="text-neutral-500"> · Turno: {turnoPadrao.nome}</span>
        ) : (
          <span className="text-amber-700"> · sem turno padrão</span>
        )}
      </p>
      <p className="text-sm text-neutral-600">
        {funcionario.cpf_final ? `CPF final ${funcionario.cpf_final}` : "CPF não informado"}
        {funcionario.data_admissao ? (
          <span> · no Postinho desde {mesAno(funcionario.data_admissao)}</span>
        ) : (
          <span className="text-amber-700"> · data de entrada não informada</span>
        )}
      </p>
      {proximas && (
        <p className="text-sm font-semibold text-sky-800">
          {proximas.inicio <= hojeISO() ? "De férias" : "Férias marcadas"} {descreverFerias(proximas)}
        </p>
      )}
      {funcionario.telefone ? (
        <a
          href={`tel:${funcionario.telefone.replace(/[^\d+]/g, "")}`}
          className="mt-1 inline-block font-medium underline"
          style={{ color: "var(--cor-principal)" }}
        >
          {funcionario.telefone}
        </a>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">Sem telefone</p>
      )}
    </div>
  );
}

function AvisoCampo({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <span className="mt-1 block text-sm font-medium text-red-700" role="alert">
      {texto}
    </span>
  );
}

/** Janela para marcar e apagar as férias de uma pessoa. */
function JanelaFerias({
  pessoa,
  lista,
  onMudou,
  onFechar,
}: {
  pessoa: Funcionario;
  lista: Ferias[];
  onMudou: () => Promise<void>;
  onFechar: () => void;
}) {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiroNome = pessoa.nome.split(/\s+/)[0];
  const hoje = hojeISO();
  const ordenadas = [...lista].sort((a, b) => b.inicio.localeCompare(a.inicio));

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

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setAviso(null);
    if (!inicio || !fim) return setAviso({ ok: false, texto: "Preencha o primeiro e o último dia." });
    if (fim < inicio) return setAviso({ ok: false, texto: "O último dia vem antes do primeiro." });
    const dias = Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000);
    if (dias > 60) return setAviso({ ok: false, texto: "Período longo demais (máximo de 61 dias)." });
    if (lista.some((f) => f.inicio <= fim && inicio <= f.fim)) {
      return setAviso({ ok: false, texto: "Já existem férias marcadas nesse período." });
    }
    setSalvando(true);
    try {
      const db = supabase();
      // Escalas já salvas nesse período: pergunta se tira.
      const { data: noPeriodo, error: erroBusca } = await db
        .from("escalas")
        .select("id")
        .eq("funcionario_id", pessoa.id)
        .gte("data", inicio)
        .lte("data", fim);
      if (erroBusca) throw erroBusca;
      const ids = (noPeriodo ?? []).map((e: { id: string }) => e.id);
      let tirou = 0;
      if (
        ids.length > 0 &&
        window.confirm(
          `${primeiroNome} está escalado(a) em ${ids.length} ${ids.length === 1 ? "turno" : "turnos"} desse período. Tirar da escala?`,
        )
      ) {
        const { error } = await db.from("escalas").delete().in("id", ids);
        if (error) throw error;
        tirou = ids.length;
      }
      const { error } = await db.from("ferias").insert({ funcionario_id: pessoa.id, inicio, fim });
      if (error) throw error;
      await onMudou();
      setInicio("");
      setFim("");
      setAviso({
        ok: true,
        texto:
          `Férias marcadas de ${diaMes(inicio)} a ${diaMes(fim)}.` +
          (tirou > 0 ? ` ${tirou} ${tirou === 1 ? "turno saiu" : "turnos saíram"} da escala.` : "") +
          (ids.length > tirou ? " Os turnos que ficaram aparecem com alerta na Escala." : ""),
      });
    } catch (e) {
      setAviso({ ok: false, texto: `Não foi possível salvar. Detalhe: ${mensagemDeErro(e)}` });
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(f: Ferias) {
    if (!window.confirm(`Apagar as férias ${descreverFerias(f)} de ${primeiroNome}?`)) return;
    setSalvando(true);
    setAviso(null);
    try {
      const { error } = await supabase().from("ferias").delete().eq("id", f.id);
      if (error) throw error;
      await onMudou();
      setAviso({ ok: true, texto: `Férias ${descreverFerias(f)} apagadas.` });
    } catch (e) {
      setAviso({ ok: false, texto: `Não foi possível apagar. Detalhe: ${mensagemDeErro(e)}` });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Férias de ${pessoa.nome}`}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 p-4">
          <p className="titulo text-xl" style={{ color: "var(--cor-principal)" }}>
            Férias · {primeiroNome}
          </p>
          <p className="text-sm text-neutral-600">
            Nesses dias a pessoa não pode ser escalada. As folgas fixas de domingo não mudam.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <form onSubmit={salvar} noValidate className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-medium">Primeiro dia</span>
                <input
                  className="campo"
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Último dia</span>
                <input
                  className="campo"
                  type="date"
                  value={fim}
                  min={inicio || undefined}
                  onChange={(e) => setFim(e.target.value)}
                />
              </label>
            </div>
            <button type="submit" className="botao w-full" disabled={salvando}>
              {salvando ? "Salvando..." : "Marcar férias"}
            </button>
          </form>

          {aviso && (
            <p
              className={`text-sm font-semibold ${aviso.ok ? "text-green-800" : "text-red-700"}`}
              role={aviso.ok ? "status" : "alert"}
            >
              {aviso.texto}
            </p>
          )}

          <div className="space-y-2">
            <p className="font-medium">Férias marcadas</p>
            {ordenadas.length === 0 ? (
              <p className="text-sm text-neutral-600">Nenhuma.</p>
            ) : (
              <ul className="space-y-2">
                {ordenadas.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
                  >
                    <span>
                      {descreverFerias(f)}
                      {f.fim < hoje && <span className="text-sm text-neutral-500"> (já passou)</span>}
                    </span>
                    <button
                      type="button"
                      className="text-sm font-semibold text-red-700 underline"
                      disabled={salvando}
                      onClick={() => apagar(f)}
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
