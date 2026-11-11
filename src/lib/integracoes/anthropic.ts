// Integração com a API da Anthropic (Claude), usada no botão "Sugerir escala".
// Roda só no servidor: usa a ANTHROPIC_API_KEY, que nunca pode ir para o navegador.
// Trocar de fornecedor de IA = mexer só neste arquivo, mantendo o formato
// EscalaSugerida (src/lib/tipos.ts) na saída.
//
// Privacidade: a IA não recebe nome, telefone nem CPF. Cada funcionário vira um
// código ("P1", "P2"...) com só a função e o sexo; o código volta para o id aqui,
// e nos recados da IA o código é trocado pelo nome antes de ir para a tela.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RegrasDaCasa } from "@/config/regras";
import type { Escala, EscalaSugerida, FuncionarioEscala, Turno } from "@/lib/tipos";
import { DIAS_SEMANA, diaMes, diasDaSemana, horaCurta, paraData } from "@/lib/datas";

/** Erro com mensagem em português, segura para mostrar na tela (sem segredos). */
export class ErroIA extends Error {}

const MODELO = "claude-opus-5-5";

export type PedidoSugestao = {
  regras: RegrasDaCasa;
  segunda: string;
  turnos: Turno[];
  // Só quem está ativo. O nome fica aqui no servidor: serve só para os recados.
  funcionarios: FuncionarioEscala[];
  // Escala já salva: a semana e os dias ao redor (periodoParaConferir).
  escalas: Escala[];
};

export type SugestaoIA = {
  escalas: EscalaSugerida[];
  observacoes: string[];
};

// Formato que a IA é obrigada a seguir na resposta.
type RespostaModelo = {
  quadros: { data: string; turno: string; pessoas: string[] }[];
  observacoes: string[];
};

function nomeDoDia(iso: string): string {
  return `${DIAS_SEMANA[paraData(iso).getDay()]} ${diaMes(iso)} (${iso})`;
}

function nomesDosDias(dias: number[]): string {
  if (dias.length === 7) return "todos os dias";
  return dias.map((d) => DIAS_SEMANA[d]).join(", ");
}

/** Regras da casa em texto simples, para a IA ler. */
function descreverRegras(regras: RegrasDaCasa): string {
  const linhas: string[] = [];
  linhas.push("MÍNIMO DE PESSOAS POR TURNO E FUNÇÃO (conta só a quantidade no turno):");
  for (const r of regras.minimos) {
    linhas.push(`- ${r.turno}, ${nomesDosDias(r.dias)}:`);
    for (const f of r.funcoes) {
      linhas.push(
        `    ${f.funcao}: ${f.minimo}${f.observacao ? ` (${f.observacao}; a hora não importa aqui)` : ""}`,
      );
    }
  }
  linhas.push("");
  linhas.push(
    `FOLGAS: cada pessoa precisa ter pelo menos ${regras.folgasPorSemana} dias sem nenhum turno na semana (segunda a domingo).`,
  );
  if (regras.domingos.mulheresEmDomingosAlternados) {
    linhas.push(
      "DOMINGOS (sexo F): não pode trabalhar dois domingos seguidos. Veja o domingo anterior no histórico.",
    );
  }
  if (regras.domingos.homensDomingosDeFolgaPorMes > 0) {
    linhas.push(
      `DOMINGOS (sexo M): precisa ter pelo menos ${regras.domingos.homensDomingosDeFolgaPorMes} domingo(s) de folga no mês do domingo desta semana. Veja os outros domingos do mês no histórico.`,
    );
  }
  if (regras.fecharEAbrir.proibido) {
    linhas.push(
      `FECHA E ABRE: quem trabalha no ${regras.fecharEAbrir.turnoQueFecha} de um dia não pode trabalhar no ${regras.fecharEAbrir.turnoQueAbre} do dia seguinte (vale também do domingo anterior para a segunda, e do domingo desta semana para a segunda seguinte, que está no histórico).`,
    );
  }
  return linhas.join("\n");
}

/** Monta o esquema da resposta, limitando datas, turnos e pessoas aos valores válidos. */
function esquemaDaResposta(dias: string[], codigosTurno: string[], codigosPessoa: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["quadros", "observacoes"],
    properties: {
      quadros: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["data", "turno", "pessoas"],
          properties: {
            data: { type: "string", enum: dias },
            turno: { type: "string", enum: codigosTurno },
            pessoas: { type: "array", items: { type: "string", enum: codigosPessoa } },
          },
        },
      },
      observacoes: { type: "array", items: { type: "string" } },
    },
  };
}

const INSTRUCOES = `Você monta a escala semanal de funcionários de um restaurante.
Responda sempre em português do Brasil.

Como trabalhar:
- Cumpra todas as regras da casa. Os mínimos são o mais importante; depois folgas, domingos e "fecha e abre".
- Só escale uma pessoa em turno da função dela.
- Parta da escala já salva desta semana: mantenha o que já está marcado sempre que não quebrar uma regra, e mexa o mínimo possível.
- Não exagere: escale o mínimo pedido em cada função e só coloque gente a mais quando não houver outro jeito. Distribua os turnos de forma justa entre as pessoas da mesma função.
- Turno sem regra de mínimo naquele dia pode ficar vazio, a não ser que já tenha gente marcada.
- Se for impossível cumprir alguma regra com as pessoas disponíveis, monte a melhor escala possível e explique em "observacoes" o que faltou, em frases curtas e simples (ex.: "Sábado no Almoço faltou 1 pessoa de Chapa: só há 2 chapeiros e um deles precisa folgar."). Cite pessoas pelo código e dias pelo nome.
- Se tudo foi cumprido, deixe "observacoes" com uma frase curta dizendo isso.
- Em "quadros", liste a semana inteira (todos os dias e turnos que terão alguém). O que não estiver na lista fica vazio.`;

/** Pede à IA uma proposta de escala para a semana. Lança ErroIA se não conseguir. */
export async function sugerirEscala(pedido: PedidoSugestao): Promise<SugestaoIA> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErroIA("A variável ANTHROPIC_API_KEY não está configurada na Vercel.");
  }

  const { regras, segunda, turnos, funcionarios, escalas } = pedido;
  const dias = diasDaSemana(segunda);
  const diasSet = new Set(dias);

  // Códigos curtos no lugar dos ids do banco.
  const codigoPessoa = new Map<string, string>();
  const idPorCodigoPessoa = new Map<string, string>();
  const nomePorCodigo = new Map<string, string>();
  funcionarios.forEach((f, i) => {
    const codigo = `P${i + 1}`;
    codigoPessoa.set(f.id, codigo);
    idPorCodigoPessoa.set(codigo, f.id);
    nomePorCodigo.set(codigo, f.nome.trim().split(/\s+/)[0]);
  });
  const codigoTurno = new Map<string, string>();
  const idPorCodigoTurno = new Map<string, string>();
  turnos.forEach((t) => {
    codigoTurno.set(t.id, t.nome);
    idPorCodigoTurno.set(t.nome, t.id);
  });

  // Escala já salva, agrupada por quadro (só de quem está ativo).
  function quadrosDe(lista: Escala[]): string {
    const porQuadro = new Map<string, string[]>();
    for (const e of lista) {
      const pessoa = codigoPessoa.get(e.funcionario_id);
      const turno = codigoTurno.get(e.turno_id);
      if (!pessoa || !turno) continue;
      const chave = `${nomeDoDia(e.data)}, ${turno}`;
      if (!porQuadro.has(chave)) porQuadro.set(chave, []);
      porQuadro.get(chave)!.push(pessoa);
    }
    if (porQuadro.size === 0) return "(nada)";
    // A lista já vem em ordem de data.
    return Array.from(porQuadro.entries())
      .map(([chave, pessoas]) => `- ${chave}: ${pessoas.join(", ")}`)
      .join("\n");
  }
  const ordemTurno = new Map(turnos.map((t) => [t.id, t.ordem]));
  const ordenadas = [...escalas].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      (ordemTurno.get(a.turno_id) ?? 0) - (ordemTurno.get(b.turno_id) ?? 0),
  );
  const daSemana = ordenadas.filter((e) => diasSet.has(e.data));
  const historico = ordenadas.filter((e) => !diasSet.has(e.data));

  const mensagem = [
    `SEMANA A MONTAR: ${dias.map(nomeDoDia).join("; ")}.`,
    "",
    "TURNOS (use o nome como código):",
    ...turnos.map((t) => `- ${t.nome}: ${horaCurta(t.hora_inicio)} às ${horaCurta(t.hora_fim)}`),
    "",
    "PESSOAS DISPONÍVEIS (código, função, sexo):",
    ...funcionarios.map(
      (f) => `- ${codigoPessoa.get(f.id)}: ${f.funcao}, sexo ${f.sexo ?? "não informado"}`,
    ),
    "",
    "REGRAS DA CASA:",
    descreverRegras(regras),
    "",
    "ESCALA JÁ SALVA NESTA SEMANA:",
    quadrosDe(daSemana),
    "",
    "HISTÓRICO FORA DA SEMANA (não mude; serve para as regras de domingo e de fecha e abre):",
    quadrosDe(historico),
  ].join("\n");

  const cliente = new Anthropic();
  let resposta: Anthropic.Beta.BetaMessage;
  try {
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      // Se o modelo recusar o pedido, a própria API tenta outro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: esquemaDaResposta(
            dias,
            turnos.map((t) => t.nome),
            Array.from(idPorCodigoPessoa.keys()),
          ),
        },
      },
      system: INSTRUCOES,
      messages: [{ role: "user", content: mensagem }],
    });
    resposta = await stream.finalMessage();
  } catch (e) {
    console.error("[ia] erro ao chamar a Anthropic:", e instanceof Error ? e.message : e);
    if (e instanceof Anthropic.AuthenticationError) {
      throw new ErroIA("A Anthropic recusou a chave (ANTHROPIC_API_KEY inválida).");
    }
    if (e instanceof Anthropic.PermissionDeniedError) {
      throw new ErroIA("A chave da Anthropic não tem permissão para usar este modelo.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ErroIA("A Anthropic está recebendo pedidos demais. Tente de novo em 1 minuto.");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new ErroIA("A Anthropic não respondeu (sem conexão ou demorou demais).");
    }
    if (e instanceof Anthropic.APIError) {
      throw new ErroIA(`A Anthropic respondeu com erro ${e.status ?? ""}. Tente de novo.`);
    }
    throw new ErroIA("Não foi possível falar com a Anthropic.");
  }

  if (resposta.stop_reason === "refusal") {
    throw new ErroIA("A IA não quis montar esta escala. Tente de novo ou monte à mão.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new ErroIA("A resposta da IA ficou grande demais e veio cortada. Tente de novo.");
  }

  const texto = resposta.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  let lida: RespostaModelo;
  try {
    lida = JSON.parse(texto) as RespostaModelo;
  } catch {
    throw new ErroIA("A IA devolveu uma resposta que não deu para ler. Tente de novo.");
  }
  if (!lida || !Array.isArray(lida.quadros)) {
    throw new ErroIA("A IA devolveu uma resposta num formato inesperado. Tente de novo.");
  }

  // Volta dos códigos para os ids, descartando o que não existir e repetições.
  const vistos = new Set<string>();
  const saida: EscalaSugerida[] = [];
  for (const q of lida.quadros) {
    const turnoId = idPorCodigoTurno.get(q?.turno);
    if (!turnoId || !diasSet.has(q?.data) || !Array.isArray(q.pessoas)) continue;
    for (const codigo of q.pessoas) {
      const funcionarioId = idPorCodigoPessoa.get(codigo);
      if (!funcionarioId) continue;
      const chave = `${q.data}|${turnoId}|${funcionarioId}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ data: q.data, turno_id: turnoId, funcionario_id: funcionarioId });
    }
  }

  const observacoes = (Array.isArray(lida.observacoes) ? lida.observacoes : [])
    .filter((o): o is string => typeof o === "string" && o.trim() !== "")
    // "P3" vira o primeiro nome da pessoa.
    .map((o) => o.trim().replace(/\bP\d+\b/g, (codigo) => nomePorCodigo.get(codigo) ?? codigo));

  return { escalas: saida, observacoes };
}
