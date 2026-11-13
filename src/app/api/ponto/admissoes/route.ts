// POST /api/ponto/admissoes
// Busca no Pontomais a data de admissão de cada colaborador e grava em
// funcionarios.data_admissao, ligando pelo CPF. Só preenche quem está sem data:
// uma data acertada à mão na tela Equipe nunca é trocada.
// Só responde para quem está conectado e liberado (veja src/lib/login-servidor.ts).
// O CPF completo fica aqui no servidor: o navegador recebe só o resumo (números).

import { ErroPonto, buscarDatasDeAdmissao } from "@/lib/integracoes/ponto";
import { conferirLogin } from "@/lib/login-servidor";
import { hojeISO } from "@/lib/datas";
import type { AdmissaoPonto, ResumoAdmissoes } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type FuncionarioDoBanco = { id: string; cpf: string | null; data_admissao: string | null };

export async function POST(request: Request) {
  const login = await conferirLogin(request);
  if (!login.ok) {
    return Response.json({ erro: login.erro }, { status: login.status });
  }

  let admissoes: AdmissaoPonto[];
  try {
    admissoes = await buscarDatasDeAdmissao();
  } catch (e) {
    const erro = e instanceof ErroPonto ? e.message : "O Pontomais não respondeu como esperado.";
    console.error("[ponto] datas de admissão:", erro);
    return Response.json({ erro }, { status: 502 });
  }
  const dataPorCpf = new Map(admissoes.map((a) => [a.cpf, a.dataAdmissao]));

  const { data, error } = await login.db
    .from("funcionarios")
    .select("id, cpf, data_admissao")
    .eq("ativo", true);
  if (error) {
    return Response.json(
      { erro: "Não foi possível ler o cadastro de funcionários." },
      { status: 500 },
    );
  }

  const resumo: ResumoAdmissoes = { preenchidas: 0, jaTinham: 0, semCpf: 0, naoEncontrados: 0 };
  const hoje = hojeISO();
  const gravar: { id: string; data: string }[] = [];
  for (const f of (data ?? []) as FuncionarioDoBanco[]) {
    if (f.data_admissao) {
      resumo.jaTinham++;
      continue;
    }
    const cpf = (f.cpf ?? "").replace(/\D/g, "");
    if (!cpf) {
      resumo.semCpf++;
      continue;
    }
    const dataAdmissao = dataPorCpf.get(cpf);
    // Data no futuro não vale (o banco também recusaria).
    if (!dataAdmissao || dataAdmissao > hoje) {
      resumo.naoEncontrados++;
      continue;
    }
    gravar.push({ id: f.id, data: dataAdmissao });
  }

  const resultados = await Promise.all(
    gravar.map((g) =>
      login.db
        .from("funcionarios")
        .update({ data_admissao: g.data })
        .eq("id", g.id)
        .is("data_admissao", null),
    ),
  );
  const falhas = resultados.filter((r) => r.error).length;
  resumo.preenchidas = gravar.length - falhas;
  if (falhas > 0) {
    return Response.json(
      { erro: `Não foi possível gravar ${falhas} data(s) no banco. Tente de novo.`, resumo },
      { status: 500 },
    );
  }
  return Response.json(resumo satisfies ResumoAdmissoes);
}
