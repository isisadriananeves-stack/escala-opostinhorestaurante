"use client";

import { useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import {
  CAMPOS_FUNCIONARIO_EQUIPE,
  FUNCOES_PADRAO,
  type FuncionarioEquipe as Funcionario,
} from "@/lib/tipos";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";
import {
  NOME_MAXIMO,
  erroCpf,
  erroNome,
  erroTelefone,
  formatarTelefone,
  limparNome,
  mensagemDoBanco,
} from "@/lib/validacao";

// Avisos que aparecem embaixo de cada campo.
type ErrosDoFormulario = { nome?: string; telefone?: string; cpf?: string };

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
};

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  funcao: FUNCOES_PADRAO[0],
  telefone: "",
  cpf: "",
  cpfFinalAtual: null,
  sexo: "",
};

/** "12345678901" -> "123.456.789-01" (deixa como está se não tiver 11 dígitos). */
function formatarCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

const ROTULO_SEXO = { F: "Feminino", M: "Masculino" } as const;

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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<ErrosDoFormulario>({});

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
    buscarFuncionarios()
      .then(setFuncionarios)
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [semVariaveis]);

  // Funções da lista padrão + qualquer outra que já exista no banco.
  const funcoes = Array.from(
    new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]),
  );

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

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
    };
    setErros(novosErros);
    if (novosErros.nome || novosErros.telefone || novosErros.cpf) {
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
        <form onSubmit={salvar} className="cartao space-y-4">
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
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
            >
              {funcoes.map((funcao) => (
                <option key={funcao} value={funcao}>
                  {funcao}
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
                <CartaoFuncionario funcionario={f} />
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
                    <CartaoFuncionario funcionario={f} />
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

function CartaoFuncionario({ funcionario }: { funcionario: Funcionario }) {
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
      </p>
      <p className="text-sm text-neutral-600">
        {funcionario.cpf_final ? `CPF final ${funcionario.cpf_final}` : "CPF não informado"}
      </p>
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
