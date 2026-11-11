// Confere a escala contra as regras da casa (src/config/regras.ts)
// e devolve os alertas da semana. Não acessa o banco: recebe os dados prontos.

import type { RegrasDaCasa, RegraDeMinimo } from "@/config/regras";
import type { Escala, FuncionarioEscala as Funcionario, Turno } from "@/lib/tipos";
import { diaMes, diasDaSemana, paraData, rotuloDia, somarDias } from "@/lib/datas";

export type TipoAlerta = "minimo" | "fechar-abrir" | "folga" | "domingo";

export type Alerta = {
  tipo: TipoAlerta;
  // Frase completa, mostrada na lista do topo.
  texto: string;
  // Frase curta, mostrada dentro do quadro (quando o alerta é de um quadro).
  curto: string;
  // Quadros (dia + turno) marcados em vermelho por este alerta.
  celulas: { data: string; turnoId: string }[];
};

// Nome de cada tipo de alerta, usado nas listas da tela.
export const ROTULO_TIPO: Record<TipoAlerta, string> = {
  minimo: "Falta gente",
  "fechar-abrir": "Fecha e abre",
  folga: "Folga",
  domingo: "Domingo",
};

export type ResultadoAlertas = {
  alertas: Alerta[];
  // Alertas por quadro: chave "data|turnoId".
  porCelula: Map<string, Alerta[]>;
  // Funcionários ativos sem sexo cadastrado (regra dos domingos não vale para eles).
  semSexo: Funcionario[];
};

export function chaveCelula(data: string, turnoId: string): string {
  return `${data}|${turnoId}`;
}

/** Compara textos sem diferenciar maiúsculas e acentos. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0];
}

/** Todos os domingos (ISO) do mês da data informada. */
export function domingosDoMes(iso: string): string[] {
  const [a, m] = iso.split("-").map(Number);
  const resultado: string[] = [];
  const d = new Date(a, m - 1, 1);
  while (d.getMonth() === m - 1) {
    if (d.getDay() === 0) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      resultado.push(`${d.getFullYear()}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return resultado;
}

const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Período de datas que precisa ser carregado do banco para conferir a semana:
 * a semana, o domingo anterior, a segunda seguinte e todos os domingos do mês.
 */
export function periodoParaConferir(segunda: string): { inicio: string; fim: string } {
  const domingo = somarDias(segunda, 6);
  const domingos = domingosDoMes(domingo);
  const candidatosInicio = [somarDias(segunda, -1), domingos[0]];
  const candidatosFim = [somarDias(domingo, 1), domingos[domingos.length - 1]];
  return {
    inicio: candidatosInicio.sort()[0],
    fim: candidatosFim.sort()[candidatosFim.length - 1],
  };
}

/** Regra de mínimo que vale para o turno nesse dia (ou undefined). */
export function regraDoQuadro(
  regras: RegrasDaCasa,
  turno: Turno,
  data: string,
): RegraDeMinimo | undefined {
  const diaSemana = paraData(data).getDay();
  return regras.minimos.find(
    (r) => normalizar(r.turno) === normalizar(turno.nome) && r.dias.includes(diaSemana),
  );
}

/** Quantas pessoas de cada função estão no quadro, comparado com o mínimo. */
export function conferirMinimo(
  regra: RegraDeMinimo,
  escalados: Funcionario[],
): { funcao: string; minimo: number; tem: number; observacao?: string }[] {
  return regra.funcoes.map((f) => ({
    funcao: f.funcao,
    minimo: f.minimo,
    observacao: f.observacao,
    tem: escalados.filter((p) => normalizar(p.funcao) === normalizar(f.funcao)).length,
  }));
}

export function calcularAlertas(params: {
  regras: RegrasDaCasa;
  segunda: string;
  turnos: Turno[];
  funcionarios: Funcionario[];
  // Escalas do período de periodoParaConferir(segunda).
  escalas: Escala[];
}): ResultadoAlertas {
  const { regras, segunda, turnos, funcionarios, escalas } = params;
  const dias = diasDaSemana(segunda);
  const domingo = dias[6];
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const alertas: Alerta[] = [];

  // Quem está em cada quadro (dia + turno), em todo o período carregado.
  const pessoasNoQuadro = new Map<string, Set<string>>();
  // Em quais dias cada pessoa trabalha.
  const diasDaPessoa = new Map<string, Set<string>>();
  for (const e of escalas) {
    const chave = chaveCelula(e.data, e.turno_id);
    if (!pessoasNoQuadro.has(chave)) pessoasNoQuadro.set(chave, new Set());
    pessoasNoQuadro.get(chave)!.add(e.funcionario_id);
    if (!diasDaPessoa.has(e.funcionario_id)) diasDaPessoa.set(e.funcionario_id, new Set());
    diasDaPessoa.get(e.funcionario_id)!.add(e.data);
  }
  const escaladosEm = (data: string, turnoId: string): Funcionario[] =>
    Array.from(pessoasNoQuadro.get(chaveCelula(data, turnoId)) ?? [])
      .map((id) => porId.get(id))
      .filter((f): f is Funcionario => Boolean(f));

  // 1. Mínimo de pessoas por turno e função.
  for (const dia of dias) {
    for (const turno of turnos) {
      const regra = regraDoQuadro(regras, turno, dia);
      if (!regra) continue;
      const faltas = conferirMinimo(regra, escaladosEm(dia, turno.id))
        .filter((c) => c.tem < c.minimo)
        .map((c) => `${c.minimo - c.tem} ${c.funcao}`);
      if (faltas.length === 0) continue;
      alertas.push({
        tipo: "minimo",
        texto: `${turno.nome} ${rotuloDia(dia)}: falta ${faltas.join(", ")}`,
        curto: `Falta ${faltas.join(", ")}`,
        celulas: [{ data: dia, turnoId: turno.id }],
      });
    }
  }

  // 2. Fechar um dia e abrir o dia seguinte.
  const { fecharEAbrir } = regras;
  const turnoFecha = turnos.find((t) => normalizar(t.nome) === normalizar(fecharEAbrir.turnoQueFecha));
  const turnoAbre = turnos.find((t) => normalizar(t.nome) === normalizar(fecharEAbrir.turnoQueAbre));
  if (fecharEAbrir.proibido && turnoFecha && turnoAbre) {
    // Do domingo anterior até o domingo da semana (o dia seguinte pode ser a segunda seguinte).
    for (let i = -1; i <= 6; i++) {
      const diaFecha = somarDias(segunda, i);
      const diaAbre = somarDias(diaFecha, 1);
      const fecham = pessoasNoQuadro.get(chaveCelula(diaFecha, turnoFecha.id)) ?? new Set<string>();
      const abrem = pessoasNoQuadro.get(chaveCelula(diaAbre, turnoAbre.id)) ?? new Set<string>();
      for (const id of fecham) {
        if (!abrem.has(id)) continue;
        const f = porId.get(id);
        if (!f) continue;
        const celulas = [
          { data: diaFecha, turnoId: turnoFecha.id },
          { data: diaAbre, turnoId: turnoAbre.id },
        ].filter((c) => dias.includes(c.data));
        alertas.push({
          tipo: "fechar-abrir",
          texto: `${f.nome} fecha ${rotuloDia(diaFecha)} e abre ${rotuloDia(diaAbre)}`,
          curto: `${primeiroNome(f.nome)}: fecha e abre`,
          celulas,
        });
      }
    }
  }

  // 3. Folgas na semana (dias sem nenhum turno).
  const ativos = funcionarios.filter((f) => f.ativo);
  for (const f of ativos) {
    const trabalhados = dias.filter((d) => diasDaPessoa.get(f.id)?.has(d)).length;
    const folgas = 7 - trabalhados;
    if (folgas < regras.folgasPorSemana) {
      alertas.push({
        tipo: "folga",
        texto: `${f.nome}: ${folgas} ${folgas === 1 ? "folga" : "folgas"} na semana (mínimo ${regras.folgasPorSemana})`,
        curto: "",
        celulas: [],
      });
    }
  }

  // 4. Domingos.
  const semSexo = ativos.filter((f) => f.sexo !== "F" && f.sexo !== "M");
  const domingoAnterior = somarDias(domingo, -7);
  const trabalhaNoDia = (id: string, dia: string) => diasDaPessoa.get(id)?.has(dia) ?? false;
  const celulasDoDomingo = (id: string) =>
    turnos
      .filter((t) => pessoasNoQuadro.get(chaveCelula(domingo, t.id))?.has(id))
      .map((t) => ({ data: domingo, turnoId: t.id }));

  if (regras.domingos.mulheresEmDomingosAlternados) {
    for (const f of ativos.filter((p) => p.sexo === "F")) {
      if (trabalhaNoDia(f.id, domingo) && trabalhaNoDia(f.id, domingoAnterior)) {
        alertas.push({
          tipo: "domingo",
          texto: `${f.nome} trabalha dois domingos seguidos (${diaMes(domingoAnterior)} e ${diaMes(domingo)})`,
          curto: `${primeiroNome(f.nome)}: 2º domingo seguido`,
          celulas: celulasDoDomingo(f.id),
        });
      }
    }
  }

  const folgaHomens = regras.domingos.homensDomingosDeFolgaPorMes;
  if (folgaHomens > 0) {
    const domingos = domingosDoMes(domingo);
    const mes = NOMES_MES[paraData(domingo).getMonth()];
    for (const f of ativos.filter((p) => p.sexo === "M")) {
      if (!trabalhaNoDia(f.id, domingo)) continue;
      const trabalhados = domingos.filter((d) => trabalhaNoDia(f.id, d)).length;
      const folgas = domingos.length - trabalhados;
      if (folgas < folgaHomens) {
        alertas.push({
          tipo: "domingo",
          texto: `${f.nome} está sem domingo de folga em ${mes} (mínimo ${folgaHomens})`,
          curto: `${primeiroNome(f.nome)}: sem domingo de folga no mês`,
          celulas: celulasDoDomingo(f.id),
        });
      }
    }
  }

  const porCelula = new Map<string, Alerta[]>();
  for (const a of alertas) {
    for (const c of a.celulas) {
      const chave = chaveCelula(c.data, c.turnoId);
      if (!porCelula.has(chave)) porCelula.set(chave, []);
      porCelula.get(chave)!.push(a);
    }
  }

  return { alertas, porCelula, semSexo };
}
