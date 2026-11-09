// Integração com a API de ponto (veja docs/api-ponto.md).
// Roda só no servidor: usa o API Secret, que nunca pode ir para o navegador.
// Trocar de fornecedor de ponto = mexer só neste arquivo, mantendo o formato
// MarcacaoPonto (src/lib/tipos.ts) na saída.

import "server-only";
import type { MarcacaoPonto } from "@/lib/tipos";
import exemplo from "../../../docs/marcacoes-exemplo.json";

/** Erro com mensagem em português, segura para mostrar na tela (sem segredos). */
export class ErroPonto extends Error {}

// Formato do fornecedor (como a API devolve).
type MarcacaoFornecedor = {
  cpf?: unknown;
  data?: unknown;
  entrada?: unknown;
  saida_intervalo?: unknown;
  volta_intervalo?: unknown;
  saida?: unknown;
};

function hora(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{2}:\d{2}$/.test(valor) ? valor : null;
}

function converter(m: MarcacaoFornecedor): MarcacaoPonto | null {
  const cpf = typeof m.cpf === "string" ? m.cpf.replace(/\D/g, "") : "";
  const data = typeof m.data === "string" ? m.data : "";
  if (cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  return {
    cpf,
    data,
    entrada: hora(m.entrada),
    saidaIntervalo: hora(m.saida_intervalo),
    voltaIntervalo: hora(m.volta_intervalo),
    saida: hora(m.saida),
  };
}

function converterLista(lista: unknown): MarcacaoPonto[] {
  if (!Array.isArray(lista)) throw new ErroPonto("A API de ponto devolveu um formato inesperado.");
  return lista
    .map((m) => converter(m as MarcacaoFornecedor))
    .filter((m): m is MarcacaoPonto => m !== null);
}

/** Marcações de um dia, direto da API de ponto. Lança ErroPonto se não conseguir. */
export async function buscarMarcacoesDoDia(data: string): Promise<MarcacaoPonto[]> {
  const url = process.env.PONTO_API_URL;
  const clientId = process.env.PONTO_CLIENT_ID;
  const apiKey = process.env.PONTO_API_KEY;
  const apiSecret = process.env.PONTO_API_SECRET;

  const faltando = [
    !url && "PONTO_API_URL",
    !clientId && "PONTO_CLIENT_ID",
    !apiKey && "PONTO_API_KEY",
    !apiSecret && "PONTO_API_SECRET",
  ].filter(Boolean);
  if (faltando.length > 0) {
    throw new ErroPonto(`Variáveis da API de ponto não configuradas: ${faltando.join(", ")}.`);
  }

  let resposta: Response;
  try {
    resposta = await fetch(
      `${url!.replace(/\/+$/, "")}/api/marcacoes?data=${encodeURIComponent(data)}`,
      {
        headers: {
          "X-Client-Id": clientId!,
          "X-Api-Key": apiKey!,
          Authorization: `Bearer ${apiSecret}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    throw new ErroPonto("A API de ponto não respondeu (fora do ar ou sem conexão).");
  }

  if (!resposta.ok) {
    let detalhe = "";
    try {
      const corpo = (await resposta.json()) as { erro?: unknown };
      if (typeof corpo.erro === "string") detalhe = `: ${corpo.erro}`;
    } catch {
      // corpo sem JSON: fica só o código
    }
    if (resposta.status === 401) {
      throw new ErroPonto(`A API de ponto recusou as credenciais${detalhe}.`);
    }
    throw new ErroPonto(`A API de ponto respondeu com erro ${resposta.status}${detalhe}.`);
  }

  try {
    return converterLista(await resposta.json());
  } catch (e) {
    if (e instanceof ErroPonto) throw e;
    throw new ErroPonto("A API de ponto devolveu uma resposta que não deu para ler.");
  }
}

/** Dados de exemplo (docs/marcacoes-exemplo.json), usados quando a API falha. */
export function marcacoesDeExemplo(data: string): {
  marcacoes: MarcacaoPonto[];
  cobre: boolean;
  datas: string[];
} {
  const todas = converterLista(exemplo);
  const datas = Array.from(new Set(todas.map((m) => m.data))).sort();
  return {
    marcacoes: todas.filter((m) => m.data === data),
    cobre: datas.includes(data),
    datas,
  };
}
