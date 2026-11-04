"use client";

import { useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";

// Dados do formulário de adicionar/editar. Sem id = funcionário novo.
type Formulario = {
  id?: string;
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = { nome: "", funcao: FUNCOES_PADRAO[0], telefone: "" };

async function buscarFuncionarios(): Promise<Funcionario[]> {
  const { data, error } = await supabase()
    .from("funcionarios")
    .select("id, nome, funcao, telefone, cpf, ativo")
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
    setFormulario({ ...FORMULARIO_VAZIO });
  }

  function abrirEdicao(f: Funcionario) {
    setAviso(null);
    setFormulario({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
    // O formulário fica no topo da tela: rola até ele.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    const telefone = formulario.telefone.trim();
    if (!nome) {
      setAviso("Preencha o nome.");
      return;
    }
    if (!funcao) {
      setAviso("Escolha a função.");
      return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const dados = { nome, funcao, telefone: telefone || null };
      const db = supabase().from("funcionarios");
      const { error } = formulario.id
        ? await db.update(dados).eq("id", formulario.id)
        : await db.insert(dados);
      if (error) throw error;
      setFormulario(null);
      await carregar();
    } catch (e) {
      setAviso(`Não foi possível salvar. ${mensagemDeErro(e)}`);
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
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoComplete="off"
              autoFocus
            />
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
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
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
      <p className="text-neutral-700">{funcionario.funcao}</p>
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
