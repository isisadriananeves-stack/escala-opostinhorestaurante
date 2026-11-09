"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { identidade } from "@/config/identidade";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Funcionario } from "@/lib/tipos";
import Team01 from "@/components/ui/team-01";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "sem-variaveis" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; funcionarios: number; turnos: number };

export default function Inicio() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  // Funcionários ativos, mostrados na vitrine da equipe.
  const [equipe, setEquipe] = useState<Funcionario[]>([]);

  useEffect(() => {
    async function verificar() {
      if (!variaveisConfiguradas()) {
        setEstado({ tipo: "sem-variaveis" });
        return;
      }
      try {
        const db = supabase();
        const [f, t, ativos] = await Promise.all([
          db.from("funcionarios").select("id", { count: "exact", head: true }),
          db.from("turnos").select("id", { count: "exact", head: true }),
          db
            .from("funcionarios")
            .select("*")
            .eq("ativo", true)
            .order("funcao")
            .order("nome"),
        ]);
        if (f.error) throw f.error;
        if (t.error) throw t.error;
        // A vitrine é só enfeite: se falhar, a tela continua funcionando sem ela.
        if (!ativos.error) setEquipe(ativos.data ?? []);
        setEstado({ tipo: "ok", funcionarios: f.count ?? 0, turnos: t.count ?? 0 });
      } catch (e) {
        setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) });
      }
    }
    verificar();
  }, []);

  return (
    <div className="space-y-5">
      <section className="cartao space-y-4 text-center">
        {identidade.logo && (
          <Image
            src={identidade.logo}
            alt={`Logo ${identidade.nome}`}
            width={176}
            height={176}
            priority
            className="mx-auto h-44 w-44"
          />
        )}
        <div>
          <h1 className="text-3xl">{identidade.nome}</h1>
          <p className="mt-1 text-neutral-700">Escala de funcionários. O que você quer fazer?</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/escala" className="botao w-full">
            Escala da semana
          </Link>
          <Link href="/equipe" className="botao-secundario w-full">
            Equipe
          </Link>
        </div>
      </section>

      {equipe.length > 0 && <Team01 pessoas={equipe} />}

      <section className="cartao">
        <h2 className="text-lg font-semibold">Conexão com o banco de dados</h2>
        {estado.tipo === "carregando" && <p className="mt-2 text-neutral-600">Verificando...</p>}
        {estado.tipo === "sem-variaveis" && (
          <p className="mt-2 text-red-700">
            As variáveis do Supabase não foram configuradas. Na Vercel, em Settings &gt;
            Environment Variables, adicione NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou ANON_KEY) e faça Redeploy.
          </p>
        )}
        {estado.tipo === "erro" && (
          <p className="mt-2 text-red-700">
            Banco conectado, mas as tabelas não responderam. Rode o arquivo
            supabase/schema.sql no SQL Editor do Supabase. Detalhe: {estado.mensagem}
          </p>
        )}
        {estado.tipo === "ok" && (
          <p className="mt-2 text-green-700">
            Banco conectado. {estado.funcionarios} funcionários e {estado.turnos} turnos
            cadastrados.
          </p>
        )}
      </section>
    </div>
  );
}
