// Confere a escala contra as regras da casa (src/config/regras.ts)
// e devolve os alertas da semana. Não acessa o banco: recebe os dados prontos.

import type { RegrasDaCasa, RegraDeMinimo } from "@/config/regras";
import type {
  DiaFechado,
  Escala,
  FolgaDomingo,
  FuncionarioEscala as Funcionario,
  Turno,
} from "@/lib/tipos";
import { folgasPorPessoa, temFolgaFixa } from "@/lib/folgas-domingo";
import { motivoDoTurno, podeTrabalharNoTurno } from "@/lib/turnos";
import { diaMes, diasDaSemana, paraData, rotuloDia, somarDias } from "@/lib/datas";

export type TipoAlerta =
  | "minimo"
  | "fechar-abrir"
  | "folga"
  | "domingo"
  | "folga-fixa"
  | "turno-funcao"
  | "dias-seguidos";

export type Alerta = {
  tipo: TipoAlerta;
  // Frase completa, mostrada na lista do topo.
  texto: string;
  // Frase curta, mostrada dentro do quadro (quando o alerta é de um quadro).
  curto: string;
  // Quadros (dia + turno) marcados em vermelho por este alerta.
  celulas: { data: string; turnoId: string }[];
  // Pessoa do alerta (folga, domingo e fecha e abre), usada na tela Folgas.
  funcionarioId?: string;
};

// Nome de cada tipo de alerta, usado nas listas da tela.
export const ROTULO_TIPO: Record<TipoAlerta, string> = {
  minimo: "Falta gente",
  "fechar-abrir": "Fecha e abre",
  folga: "Folga",
  domingo: "Domingo",
  "folga-fixa": "Folga fixa",
  "turno-funcao": "Turno da função",
  "dias-seguidos": "Dias seguidos",
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
 * Período de datas que precisa ser carregado do banco para conferir a semana
 * (a semana, 7 dias antes e 7 depois, por causa da regra de dias seguidos,
 * e todos os domingos do mês):
 * a semana (domingo a sábado), o sábado anterior, o domingo seguinte e todos os
 * domingos do mês do domingo desta semana.
 */
export function periodoParaConferir(inicioSemana: string): { inicio: string; fim: string } {
  const sabado = somarDias(inicioSemana, 6);
  const domingos = domingosDoMes(inicioSemana);
  const candidatosInicio = [somarDias(inicioSemana, -7), domingos[0]];
  const candidatosFim = [somarDias(sabado, 7), domingos[domingos.length - 1]];
  return {
    inicio: candidatosInicio.sort()[0],
    fim: candidatosFim.sort()[candidatosFim.length - 1],
  };
}

/**
 * Dias de folga de uma pessoa na semana: os dias sem nenhum turno.
 * Dia com o restaurante fechado (ex.: Natal) NÃO conta como folga.
 * Usada nos alertas da Escala e na tela Folgas, para as duas contarem igual.
 */
export function diasDeFolga(
  dias: string[],
  diasTrabalhados: Set<string> | undefined,
  fechados: Set<string> = new Set(),
): string[] {
  return dias.filter((d) => !diasTrabalhados?.has(d) && !fechados.has(d));
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
  inicioSemana: string;
  turnos: Turno[];
  funcionarios: Funcionario[];
  // Escalas do período de periodoParaConferir(inicioSemana).
  escalas: Escala[];
  // Folgas fixas de domingo (tabela folgas_domingo).
  folgasFixas?: FolgaDomingo[];
  // Dias com o restaurante fechado (tabela dias_fechados).
  diasFechados?: DiaFechado[];
}): ResultadoAlertas {
  const {
    regras,
    inicioSemana,
    turnos,
    funcionarios,
    escalas,
    folgasFixas = [],
    diasFechados = [],
  } = params;
  const fechados = new Set(diasFechados.map((d) => d.data));
  const dias = diasDaSemana(inicioSemana);
  // A semana começa no domingo: ele é o primeiro dia.
  const domingo = dias[0];
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

  // 1. Mínimo de pessoas por turno e função (dia fechado não tem mínimo).
  for (const dia of dias) {
    if (fechados.has(dia)) continue;
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
    // Do sábado anterior até o último sábado da semana (o dia seguinte pode ser o domingo seguinte).
    for (let i = -1; i <= 6; i++) {
      const diaFecha = somarDias(inicioSemana, i);
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
          funcionarioId: f.id,
        });
      }
    }
  }

  // 3. Folgas na semana (dias sem nenhum turno).
  const ativos = funcionarios.filter((f) => f.ativo);
  for (const f of ativos) {
    const folgas = diasDeFolga(dias, diasDaPessoa.get(f.id), fechados).length;
    if (folgas < regras.folgasPorSemana) {
      alertas.push({
        tipo: "folga",
        texto: `${f.nome}: ${folgas} ${folgas === 1 ? "folga" : "folgas"} na semana (mínimo ${regras.folgasPorSemana})`,
        curto: "",
        celulas: [],
        funcionarioId: f.id,
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
          funcionarioId: f.id,
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
      // Domingo com o restaurante fechado não conta como domingo de folga.
      const folgas = domingos.filter((d) => !trabalhaNoDia(f.id, d) && !fechados.has(d)).length;
      if (folgas < folgaHomens) {
        alertas.push({
          tipo: "domingo",
          texto: `${f.nome} está sem domingo de folga em ${mes} (mínimo ${folgaHomens})`,
          curto: `${primeiroNome(f.nome)}: sem domingo de folga no mês`,
          celulas: celulasDoDomingo(f.id),
          funcionarioId: f.id,
        });
      }
    }
  }

  // 5. Escalado no domingo de folga fixa (o banco já recusa; isto pega o que foi salvo antes).
  const mapaFolgas = folgasPorPessoa(folgasFixas);
  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  for (const e of escalas) {
    if (!dias.includes(e.data) || !temFolgaFixa(mapaFolgas, e.funcionario_id, e.data)) continue;
    const f = porId.get(e.funcionario_id);
    const turno = turnoPorId.get(e.turno_id);
    if (!f || !turno) continue;
    alertas.push({
      tipo: "folga-fixa",
      texto: `${f.nome} está no ${turno.nome} ${rotuloDia(e.data)}, que é folga fixa dele(a)`,
      curto: `${primeiroNome(f.nome)}: folga fixa`,
      celulas: [{ data: e.data, turnoId: turno.id }],
      funcionarioId: f.id,
    });
  }

  // 7. Dias seguidos de trabalho sem folga (atravessa a virada da semana).
  // Dia fechado não tem escala, então interrompe a sequência sozinho.
  if (regras.maxDiasSeguidos > 0) {
    for (const f of ativos) {
      const trabalhados = Array.from(diasDaPessoa.get(f.id) ?? []).sort();
      let inicio = 0;
      for (let i = 1; i <= trabalhados.length; i++) {
        const continua = i < trabalhados.length && somarDias(trabalhados[i - 1], 1) === trabalhados[i];
        if (continua) continue;
        const sequencia = trabalhados.slice(inicio, i);
        inicio = i;
        if (sequencia.length <= regras.maxDiasSeguidos) continue;
        // Só avisa se a sequência passa pela semana na tela.
        if (!sequencia.some((d) => dias.includes(d))) continue;
        const primeiro = sequencia[0];
        const ultimo = sequencia[sequencia.length - 1];
        // Quadros marcados: do dia que passou do limite em diante (dentro da semana).
        const celulas = sequencia
          .slice(regras.maxDiasSeguidos)
          .filter((d) => dias.includes(d))
          .flatMap((d) =>
            turnos
              .filter((t) => pessoasNoQuadro.get(chaveCelula(d, t.id))?.has(f.id))
              .map((t) => ({ data: d, turnoId: t.id })),
          );
        alertas.push({
          tipo: "dias-seguidos",
          texto: `${f.nome} trabalha ${sequencia.length} dias seguidos (${rotuloDia(primeiro)} a ${rotuloDia(ultimo)}; máximo ${regras.maxDiasSeguidos})`,
          curto: `${primeiroNome(f.nome)}: ${sequencia.length} dias seguidos`,
          celulas,
          funcionarioId: f.id,
        });
      }
    }
  }

  // 6. Escalado num turno que não é da sua função (o banco já recusa; isto pega o que foi salvo antes).
  for (const e of escalas) {
    if (!dias.includes(e.data)) continue;
    const f = porId.get(e.funcionario_id);
    const turno = turnoPorId.get(e.turno_id);
    if (!f || !turno || podeTrabalharNoTurno(f.funcao, turno, turnos)) continue;
    alertas.push({
      tipo: "turno-funcao",
      texto: `${f.nome} está no ${turno.nome} ${rotuloDia(e.data)}, mas ${motivoDoTurno(f.funcao, turno)}`,
      curto: `${primeiroNome(f.nome)}: turno errado`,
      celulas: [{ data: e.data, turnoId: turno.id }],
      funcionarioId: f.id,
    });
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
