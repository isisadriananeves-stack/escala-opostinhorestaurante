// Integração com a API de ponto do Pontomais (veja docs/api-ponto.md).
// Roda só no servidor: usa o token do Pontomais, que nunca pode ir para o navegador.
// Trocar de fornecedor de ponto = mexer só neste arquivo, mantendo o formato
// MarcacaoPonto (src/lib/tipos.ts) na saída.
//
// Como funciona (o Pontomais não traz o CPF junto das batidas):
//   1. busca a lista de colaboradores (id, CPF, PIS e matrícula);
//   2. pede o relatório "Registros de ponto" do dia, em JSON;
//   3. liga cada batida ao CPF pela matrícula ou, se faltar, pelo PIS;
//   4. organiza as batidas de cada pessoa em entrada, intervalo e saída.

import "server-only";
import type { MarcacaoPonto } from "@/lib/tipos";
import exemplo from "../../../docs/marcacoes-exemplo.json";

/** Erro com mensagem em português, segura para mostrar na tela (sem segredos). */
export class ErroPonto extends Error {}

const TEMPO_LIMITE_MS = 15_000;
const POR_PAGINA = 20; // a documentação do Pontomais cita no máximo 20 por página em listagens
const MAXIMO_DE_PAGINAS = 200;

// ---------------------------------------------------------------------------
// Formato do Pontomais (como a API devolve)
// ---------------------------------------------------------------------------
type ColaboradorPontomais = {
  id?: unknown;
  cpf?: unknown; // "999.999.999-99"
  nis?: unknown; // PIS: "999.99999.99-9"
  registration_number?: unknown; // matrícula: "456"
};

type BatidaPontomais = {
  date?: unknown; // "Ter, 04/09/2018"
  time?: unknown; // "08:00"
  pis?: unknown;
  registration_number?: unknown;
  time_card_index?: unknown; // "1ª Entrada", "1ª Saída", "2ª Entrada", "2ª Saída"
};

// ---------------------------------------------------------------------------
// Chamada à API
// ---------------------------------------------------------------------------
function configuracao(): { url: string; token: string } {
  const url = process.env.PONTO_API_URL;
  const token = process.env.PONTO_API_TOKEN;
  const faltando = [!url && "PONTO_API_URL", !token && "PONTO_API_TOKEN"].filter(Boolean);
  if (faltando.length > 0) {
    throw new ErroPonto(`Variáveis do Pontomais não configuradas: ${faltando.join(", ")}.`);
  }
  return { url: url!.replace(/\/+$/, ""), token: token! };
}

async function chamarPontomais(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST"; corpo?: unknown } = {},
): Promise<unknown> {
  const { url, token } = configuracao();
  let resposta: Response;
  try {
    resposta = await fetch(`${url}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: {
        "access-token": token,
        Accept: "application/json",
        ...(opcoes.corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch {
    throw new ErroPonto("O Pontomais não respondeu (fora do ar ou sem conexão).");
  }
  if (resposta.status === 401) {
    throw new ErroPonto("O Pontomais recusou o token (ausente ou inválido).");
  }
  if (resposta.status === 403) {
    throw new ErroPonto("O Pontomais negou o acesso (verifique se a API está contratada).");
  }
  if (!resposta.ok) {
    throw new ErroPonto(`O Pontomais respondeu com erro ${resposta.status}.`);
  }
  try {
    return await resposta.json();
  } catch {
    throw new ErroPonto("O Pontomais devolveu uma resposta que não deu para ler.");
  }
}

// ---------------------------------------------------------------------------
// Tradução dos campos
// ---------------------------------------------------------------------------
function soDigitos(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number" ? String(valor).replace(/\D/g, "") : "";
}

/** Matrícula sem espaços e sem zeros à esquerda ("0001" = "1"). */
function chaveMatricula(valor: unknown): string {
  if (typeof valor !== "string" && typeof valor !== "number") return "";
  const texto = String(valor).trim();
  return texto.replace(/^0+(?=.)/, "");
}

/** "Ter, 04/09/2018" (ou "2018-09-04") -> "2018-09-04". */
function converterData(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const br = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** "08:00" ou "08:00:00" -> "08:00". */
function converterHora(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "1ª Entrada" -> "entrada"; "2ª Saída" -> "saida"; desconhecido -> null. */
function tipoDaBatida(valor: unknown): "entrada" | "saida" | null {
  if (typeof valor !== "string") return null;
  const t = semAcento(valor);
  if (t.includes("entrada")) return "entrada";
  if (t.includes("saida")) return "saida";
  return null;
}

/** Junta todas as linhas de batida do relatório, em qualquer nível de agrupamento. */
function linhasDoRelatorio(no: unknown, saida: BatidaPontomais[] = []): BatidaPontomais[] {
  if (Array.isArray(no)) {
    for (const item of no) linhasDoRelatorio(item, saida);
  } else if (no && typeof no === "object") {
    const objeto = no as Record<string, unknown>;
    if ("time" in objeto && "date" in objeto) saida.push(objeto as BatidaPontomais);
    else if ("data" in objeto) linhasDoRelatorio(objeto.data, saida);
  }
  return saida;
}

/**
 * Batidas de uma pessoa num dia (já em ordem de horário) ->
 * entrada, saída do intervalo, volta do intervalo e saída.
 */
export function organizarBatidas(
  batidas: { hora: string; tipo: "entrada" | "saida" | null }[],
): Pick<MarcacaoPonto, "entrada" | "saidaIntervalo" | "voltaIntervalo" | "saida"> {
  // Sem o tipo informado, vale a ordem: entrada, saída, entrada, saída...
  const comTipo = batidas.map((b, i) => ({
    hora: b.hora,
    tipo: b.tipo ?? (i % 2 === 0 ? "entrada" : "saida"),
  }));
  const n = comTipo.length;
  const ultima = comTipo[n - 1];
  return {
    entrada: comTipo[0]?.hora ?? null,
    saidaIntervalo: n >= 3 ? comTipo[1].hora : null,
    voltaIntervalo: n >= 3 ? comTipo[2].hora : null,
    // Número ímpar de batidas (ex.: ainda não saiu) deixa a saída vazia.
    saida: n >= 2 && ultima.tipo === "saida" ? ultima.hora : null,
  };
}

// ---------------------------------------------------------------------------
// Funções usadas pela rota /api/ponto/marcacoes
// ---------------------------------------------------------------------------

/** Colaboradores do Pontomais: matrícula e PIS -> CPF (só dígitos). */
async function mapaDeCpfs(): Promise<{ porMatricula: Map<string, string>; porPis: Map<string, string> }> {
  const porMatricula = new Map<string, string>();
  const porPis = new Map<string, string>();
  for (let pagina = 1; pagina <= MAXIMO_DE_PAGINAS; pagina++) {
    const resposta = (await chamarPontomais(
      `/external_api/v1/employees?active=true&attributes=id,cpf,nis,registration_number` +
        `&page=${pagina}&per_page=${POR_PAGINA}`,
    )) as { employees?: unknown };
    const lista = Array.isArray(resposta?.employees) ? (resposta.employees as ColaboradorPontomais[]) : null;
    if (!lista) throw new ErroPonto("O Pontomais devolveu a lista de colaboradores num formato inesperado.");
    for (const c of lista) {
      const cpf = soDigitos(c.cpf);
      if (cpf.length !== 11) continue;
      const matricula = chaveMatricula(c.registration_number);
      const pis = soDigitos(c.nis);
      if (matricula) porMatricula.set(matricula, cpf);
      if (pis) porPis.set(pis, cpf);
    }
    if (lista.length < POR_PAGINA) break;
  }
  return { porMatricula, porPis };
}

/** Marcações de um dia, direto do Pontomais. Lança ErroPonto se não conseguir. */
export async function buscarMarcacoesDoDia(data: string): Promise<MarcacaoPonto[]> {
  const [{ porMatricula, porPis }, relatorio] = await Promise.all([
    mapaDeCpfs(),
    chamarPontomais("/external_api/v1/reports/time_cards", {
      metodo: "POST",
      corpo: {
        report: {
          start_date: data,
          end_date: data,
          group_by: "employee",
          row_filters: "",
          columns: "employee_name,pis,registration_number,date,time,time_card_index",
          format: "json",
        },
      },
    }),
  ]);

  // Agrupa as batidas do dia por CPF.
  const batidasPorCpf = new Map<string, { hora: string; tipo: "entrada" | "saida" | null }[]>();
  let semCadastro = 0;
  for (const linha of linhasDoRelatorio((relatorio as { data?: unknown })?.data)) {
    if (converterData(linha.date) !== data) continue;
    const hora = converterHora(linha.time);
    if (!hora) continue;
    const cpf =
      porMatricula.get(chaveMatricula(linha.registration_number)) ?? porPis.get(soDigitos(linha.pis));
    if (!cpf) {
      semCadastro++;
      continue;
    }
    const lista = batidasPorCpf.get(cpf) ?? [];
    lista.push({ hora, tipo: tipoDaBatida(linha.time_card_index) });
    batidasPorCpf.set(cpf, lista);
  }
  if (semCadastro > 0) {
    // Só a quantidade, sem nomes nem documentos.
    console.warn(`[ponto] ${semCadastro} batida(s) sem matrícula ou PIS reconhecido no Pontomais.`);
  }

  return Array.from(batidasPorCpf.entries()).map(([cpf, batidas]) => ({
    cpf,
    data,
    ...organizarBatidas([...batidas].sort((a, b) => a.hora.localeCompare(b.hora))),
  }));
}

// ---------------------------------------------------------------------------
// Dados de exemplo (docs/marcacoes-exemplo.json), usados quando a API falha
// ---------------------------------------------------------------------------
type MarcacaoExemplo = {
  cpf?: unknown;
  data?: unknown;
  entrada?: unknown;
  saida_intervalo?: unknown;
  volta_intervalo?: unknown;
  saida?: unknown;
};

function converterExemplo(m: MarcacaoExemplo): MarcacaoPonto | null {
  const cpf = soDigitos(m.cpf);
  const data = typeof m.data === "string" ? m.data : "";
  if (cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  return {
    cpf,
    data,
    entrada: converterHora(m.entrada),
    saidaIntervalo: converterHora(m.saida_intervalo),
    voltaIntervalo: converterHora(m.volta_intervalo),
    saida: converterHora(m.saida),
  };
}

export function marcacoesDeExemplo(data: string): {
  marcacoes: MarcacaoPonto[];
  cobre: boolean;
  datas: string[];
} {
  const todas = (exemplo as MarcacaoExemplo[])
    .map(converterExemplo)
    .filter((m): m is MarcacaoPonto => m !== null);
  const datas = Array.from(new Set(todas.map((m) => m.data))).sort();
  return {
    marcacoes: todas.filter((m) => m.data === data),
    cobre: datas.includes(data),
    datas,
  };
}
