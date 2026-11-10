// GET /api/ponto/marcacoes?data=AAAA-MM-DD
// Busca as marcações do dia na API de ponto (no servidor, com as credenciais
// das variáveis de ambiente). Se a API falhar, devolve os dados de exemplo
// e o motivo, para a tela avisar em vez de quebrar.
// Só responde para quem está conectado e liberado (veja src/lib/login-servidor.ts).
//
// O CPF completo fica aqui no servidor: cada marcação volta para o navegador
// já ligada ao funcionário (funcionarioId), só com o final do CPF.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroPonto, buscarMarcacoesDoDia, marcacoesDeExemplo } from "@/lib/integracoes/ponto";
import { conferirLogin } from "@/lib/login-servidor";
import type { MarcacaoConferida, MarcacaoPonto, RespostaMarcacoes } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// Liga cada marcação ao funcionário do sistema pelo CPF.
async function ligarAosFuncionarios(
  db: SupabaseClient,
  marcacoes: MarcacaoPonto[],
): Promise<MarcacaoConferida[]> {
  const { data, error } = await db
    .from("funcionarios")
    .select("id, cpf")
    .not("cpf", "is", null);
  if (error) throw error;
  const idPorCpf = new Map(
    (data ?? []).map((f: { id: string; cpf: string }) => [f.cpf.replace(/\D/g, ""), f.id]),
  );
  return marcacoes.map(({ cpf, ...resto }) => ({
    ...resto,
    funcionarioId: idPorCpf.get(cpf) ?? null,
    cpfFinal: cpf.slice(-4),
  }));
}

export async function GET(request: Request) {
  const login = await conferirLogin(request);
  if (!login.ok) {
    return Response.json({ erro: login.erro }, { status: login.status });
  }

  const data = new URL(request.url).searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return Response.json({ erro: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }

  let resposta: Omit<RespostaMarcacoes, "marcacoes">;
  let marcacoes: MarcacaoPonto[];
  try {
    marcacoes = await buscarMarcacoesDoDia(data);
    resposta = { fonte: "api", aviso: null, temDados: true, datasDeExemplo: [] };
  } catch (e) {
    const aviso =
      e instanceof ErroPonto ? e.message : "A API de ponto não respondeu como esperado.";
    // Registro para quem olhar os logs da Vercel (sem credenciais).
    console.error("[ponto] usando dados de exemplo:", aviso);
    const exemplo = marcacoesDeExemplo(data);
    marcacoes = exemplo.marcacoes;
    resposta = {
      fonte: "exemplo",
      aviso,
      temDados: exemplo.cobre,
      datasDeExemplo: exemplo.datas,
    };
  }

  try {
    const conferidas = await ligarAosFuncionarios(login.db, marcacoes);
    return Response.json({ ...resposta, marcacoes: conferidas } satisfies RespostaMarcacoes);
  } catch {
    return Response.json(
      { erro: "Não foi possível ler o cadastro de funcionários para conferir o ponto." },
      { status: 500 },
    );
  }
}
