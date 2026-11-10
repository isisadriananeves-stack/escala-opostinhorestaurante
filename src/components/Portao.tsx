"use client";

// "Portão" do sistema: sem login, mostra só a tela Entrar.
// A proteção de verdade está no banco (regras de acesso no Supabase);
// este portão só organiza a entrada e a saída.

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { identidade } from "@/config/identidade";

type Sessao = { email: string | null; sair: () => Promise<void> };
const SessaoContexto = createContext<Sessao | null>(null);

/** Quem está conectado (null fora do portão ou sem login). */
export function useSessao(): Sessao | null {
  return useContext(SessaoContexto);
}

type Estado =
  | { tipo: "verificando" }
  | { tipo: "sem-login" }
  | { tipo: "sem-permissao"; email: string | null }
  | { tipo: "logado"; email: string | null };

// Confere no banco se o e-mail está na lista de autorizados.
// Se a conferência ainda não existir no banco, deixa entrar
// (o banco continua sendo quem decide o que cada um vê).
async function estaAutorizado(): Promise<boolean> {
  const { data, error } = await supabase().rpc("usuario_autorizado");
  if (error) return true;
  return data === true;
}

export function Portao({
  cabecalho,
  children,
}: {
  cabecalho: React.ReactNode;
  children: React.ReactNode;
}) {
  const semVariaveis = !variaveisConfiguradas();
  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });

  useEffect(() => {
    if (semVariaveis) return;
    const db = supabase();
    let ativo = true;

    async function avaliar(email: string | null | undefined, temSessao: boolean) {
      if (!temSessao) {
        if (ativo) setEstado({ tipo: "sem-login" });
        return;
      }
      const ok = await estaAutorizado();
      if (!ativo) return;
      setEstado(ok ? { tipo: "logado", email: email ?? null } : { tipo: "sem-permissao", email: email ?? null });
    }

    db.auth.getSession().then(({ data }) => {
      avaliar(data.session?.user.email, Boolean(data.session));
    });
    const { data: inscricao } = db.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        // Fora do callback, como pede a biblioteca do Supabase.
        setTimeout(() => avaliar(sessao?.user.email, Boolean(sessao)), 0);
      }
    });
    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, [semVariaveis]);

  const sair = useCallback(async () => {
    await supabase().auth.signOut();
    setEstado({ tipo: "sem-login" });
  }, []);

  // Sem as variáveis do banco, cada tela já mostra o aviso de configuração.
  if (semVariaveis) {
    return (
      <>
        {cabecalho}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
      </>
    );
  }

  if (estado.tipo === "logado") {
    return (
      <SessaoContexto.Provider value={{ email: estado.email, sair }}>
        {cabecalho}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
      </SessaoContexto.Provider>
    );
  }

  return (
    <>
      <CabecalhoSimples />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        {estado.tipo === "verificando" && (
          <p className="text-center text-neutral-600">Carregando...</p>
        )}
        {estado.tipo === "sem-login" && <TelaEntrar />}
        {estado.tipo === "sem-permissao" && (
          <div className="cartao space-y-4 text-center">
            <h1 className="text-2xl">Acesso não liberado</h1>
            <p className="text-neutral-700">
              O e-mail {estado.email ? <strong>{estado.email}</strong> : "usado"} entrou, mas
              ainda não tem permissão para usar o sistema. Peça ao responsável para liberar.
            </p>
            <button type="button" className="botao w-full" onClick={sair}>
              Sair
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function CabecalhoSimples() {
  return (
    <header
      className="shadow-md"
      style={{
        background: "var(--cor-principal)",
        color: "var(--cor-texto-claro)",
        borderBottom: "4px double var(--cor-detalhe)",
      }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {identidade.logo ? (
          <Image
            src={identidade.logo}
            alt={`Logo ${identidade.nome}`}
            width={52}
            height={52}
            priority
            className="h-[52px] w-[52px] shrink-0 rounded-full ring-2 ring-[color:var(--cor-detalhe)]"
            style={{ background: "var(--cor-secundaria)" }}
          />
        ) : null}
        <span className="titulo text-2xl leading-tight tracking-wide">{identidade.nome}</span>
      </div>
    </header>
  );
}

function TelaEntrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!email.trim() || !senha) {
      setAviso("Preencha o e-mail e a senha.");
      return;
    }
    setEntrando(true);
    setAviso(null);
    const { error } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setEntrando(false);
    if (error) {
      const credenciais =
        error.code === "invalid_credentials" || /invalid login/i.test(error.message);
      setAviso(
        credenciais
          ? "E-mail ou senha incorretos."
          : `Não foi possível entrar agora. Tente de novo. (${error.message})`,
      );
    }
    // Deu certo: o portão percebe o login sozinho e abre o sistema.
  }

  return (
    <form onSubmit={entrar} className="cartao space-y-4">
      <div className="text-center">
        {identidade.logo && (
          <Image
            src={identidade.logo}
            alt=""
            width={112}
            height={112}
            className="mx-auto h-28 w-28"
          />
        )}
        <h1 className="mt-2 text-3xl">Entrar</h1>
        <p className="text-neutral-700">Escala de funcionários</p>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">E-mail</span>
        <input
          className="campo"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Senha</span>
        <input
          className="campo"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </label>
      {aviso && (
        <p className="text-red-700" role="alert">
          {aviso}
        </p>
      )}
      <button type="submit" className="botao w-full" disabled={entrando}>
        {entrando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
