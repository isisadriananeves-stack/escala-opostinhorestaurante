// Folgas do mês de cada funcionário (aba Folgas, visão "Mês"). Função pura, sem banco.
//
// Como cada dia conta:
// - folga = dia sem nenhum turno (a folga fixa de domingo conta como folga);
// - dia com o restaurante fechado (Natal, Ano Novo) não entra na conta;
// - férias não são folga: contam à parte;
// - dia em que ninguém está escalado = escala ainda não montada: fica fora da conta;
// - a conta começa no início das escalas (REGRAS.inicioDasEscalas).

import type { Escala, Ferias, FuncionarioEscala } from "@/lib/tipos";
import { paraData, paraISO, somarDias } from "@/lib/datas";
import { feriasNoDia } from "@/lib/ferias";

export type LinhaDoMes = {
  funcionario: FuncionarioEscala;
  folgas: string[]; // datas "AAAA-MM-DD"
  domingos: number; // folgas que caíram em domingo
  trabalhados: number;
  ferias: string[]; // datas de férias no mês (com escala montada)
};

export type FolgasDoMes = {
  inicio: string; // primeiro dia contado (1º do mês ou início das escalas)
  fim: string; // último dia do mês
  diasMontados: string[]; // dias com escala montada (sem os fechados)
  diasSemEscala: string[]; // dias ainda sem escala (sem os fechados)
  diasFechados: string[];
  linhas: LinhaDoMes[];
};

/** Primeiro e último dia do mês ("AAAA-MM"). */
export function limitesDoMes(anoMes: string): { primeiro: string; ultimo: string } {
  const [ano, mes] = anoMes.split("-").map(Number);
  return {
    primeiro: paraISO(new Date(ano, mes - 1, 1)),
    ultimo: paraISO(new Date(ano, mes, 0)),
  };
}

/** "2026-12" -> "2027-01" (ou -1 para o anterior). */
export function somarMeses(anoMes: string, quantos: number): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  return paraISO(new Date(ano, mes - 1 + quantos, 1)).slice(0, 7);
}

export function contarFolgasDoMes(params: {
  anoMes: string; // "AAAA-MM"
  inicioDasEscalas: string;
  funcionarios: FuncionarioEscala[]; // só os ativos
  escalas: Escala[]; // do mês
  fechados: Set<string>;
  mapaFerias: Map<string, Ferias[]>;
}): FolgasDoMes {
  const { anoMes, inicioDasEscalas, funcionarios, escalas, fechados, mapaFerias } = params;
  const { primeiro, ultimo } = limitesDoMes(anoMes);
  const inicio = primeiro < inicioDasEscalas ? inicioDasEscalas : primeiro;

  const dias: string[] = [];
  for (let d = inicio; d <= ultimo; d = somarDias(d, 1)) dias.push(d);
  const comEscala = new Set(escalas.map((e) => e.data));
  const diasFechados = dias.filter((d) => fechados.has(d));
  const diasMontados = dias.filter((d) => !fechados.has(d) && comEscala.has(d));
  const diasSemEscala = dias.filter((d) => !fechados.has(d) && !comEscala.has(d));

  const diasDaPessoa = new Map<string, Set<string>>();
  for (const e of escalas) {
    if (!diasDaPessoa.has(e.funcionario_id)) diasDaPessoa.set(e.funcionario_id, new Set());
    diasDaPessoa.get(e.funcionario_id)!.add(e.data);
  }

  const linhas = funcionarios.map((funcionario) => {
    const trabalhou = diasDaPessoa.get(funcionario.id) ?? new Set<string>();
    const linha: LinhaDoMes = { funcionario, folgas: [], domingos: 0, trabalhados: 0, ferias: [] };
    for (const d of diasMontados) {
      if (feriasNoDia(mapaFerias, funcionario.id, d)) linha.ferias.push(d);
      else if (trabalhou.has(d)) linha.trabalhados++;
      else {
        linha.folgas.push(d);
        if (paraData(d).getDay() === 0) linha.domingos++;
      }
    }
    return linha;
  });

  return { inicio, fim: ultimo, diasMontados, diasSemEscala, diasFechados, linhas };
}
