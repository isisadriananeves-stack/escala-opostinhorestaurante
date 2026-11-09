// GET /api/ponto/marcacoes?data=AAAA-MM-DD
// Busca as marcações do dia na API de ponto (no servidor, com as credenciais
// das variáveis de ambiente). Se a API falhar, devolve os dados de exemplo
// e o motivo, para a tela avisar em vez de quebrar.

import { ErroPonto, buscarMarcacoesDoDia, marcacoesDeExemplo } from "@/lib/integracoes/ponto";
import type { RespostaMarcacoes } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = new URL(request.url).searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return Response.json({ erro: "Data inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }

  try {
    const marcacoes = await buscarMarcacoesDoDia(data);
    const resposta: RespostaMarcacoes = {
      fonte: "api",
      marcacoes,
      aviso: null,
      temDados: true,
      datasDeExemplo: [],
    };
    return Response.json(resposta);
  } catch (e) {
    const aviso =
      e instanceof ErroPonto ? e.message : "A API de ponto não respondeu como esperado.";
    // Registro para quem olhar os logs da Vercel (sem credenciais).
    console.error("[ponto] usando dados de exemplo:", aviso);
    const exemplo = marcacoesDeExemplo(data);
    const resposta: RespostaMarcacoes = {
      fonte: "exemplo",
      marcacoes: exemplo.marcacoes,
      aviso,
      temDados: exemplo.cobre,
      datasDeExemplo: exemplo.datas,
    };
    return Response.json(resposta);
  }
}
